/**
 * In-process agent runner for the dashboard's Agent Console.
 *
 * Runs an OpenAI-compatible LLM (Groq by default) in a tool-calling loop against
 * Comptroller's tools, emitting events (reasoning / tool_call / tool_result) so the
 * UI can stream the agent "thinking and spending" live. Falls back to a scripted
 * run when no LLM key is set, so the demo always works.
 *
 * The SAME capabilities are exposed over MCP (src/mcp/server.ts) for external
 * agents — this in-process runner is just for the embedded console.
 */

import OpenAI from "openai";
import { getComptroller } from "../comptroller/instance";
import { formatMoney, toMinor } from "../money";
import type { FundResult } from "../comptroller/service";

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

type Emit = (e: AgentEvent) => void;

const SYSTEM =
  "You are an autonomous AI agent with a corporate wallet governed by Comptroller. " +
  "You cannot touch the company bank account directly — you must request funds via the " +
  "tools. Think briefly, call tools to accomplish the goal, and report the outcome of " +
  "each funding decision (approved / needs human approval / denied).";

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

function tools(): ToolDef[] {
  return [
    {
      name: "list_agents",
      description: "List the AI agents and their spending mandates (caps, currencies, allowed merchant categories).",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        const { ledger } = getComptroller();
        return JSON.stringify(
          ledger.getAgents().map((a) => ({
            agentId: a.agentId,
            currency: a.baseCurrency,
            perTaskCap: formatMoney(a.perTaskCapMinor, a.baseCurrency),
            dailyCap: formatMoney(a.dailyCapMinor, a.baseCurrency),
            autoApproveUpTo: formatMoney(a.autoApproveThresholdMinor, a.baseCurrency),
            allowedMerchantCategories: a.allowedMerchantCategories,
          })),
        );
      },
    },
    {
      name: "request_funds",
      description:
        "Request funds from the treasury for a task. Comptroller checks the mandate, converts FX, and issues a scoped single-use card if approved. Returns AUTO_APPROVE / NEEDS_HUMAN / DENY.",
      parameters: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Requesting agent id (see list_agents)" },
          task: { type: "string", description: "What the funds are for" },
          amount: { type: "number", description: "Amount in major units, e.g. 400 = $400" },
          currency: { type: "string", description: "ISO currency, e.g. USD, EUR, GBP" },
          merchantCategory: { type: "string", description: "Merchant category code (MCC)" },
          merchantName: { type: "string", description: "Merchant name for the audit trail" },
        },
        required: ["agentId", "task", "amount", "currency"],
      },
      handler: async (a) => {
        const { comptroller } = getComptroller();
        const r: FundResult = await comptroller.fundRequest({
          agentId: String(a.agentId),
          task: String(a.task),
          amountMinor: toMinor(Number(a.amount)),
          currency: String(a.currency),
          merchantCategory: a.merchantCategory ? String(a.merchantCategory) : undefined,
          merchantName: a.merchantName ? String(a.merchantName) : undefined,
        });
        return JSON.stringify(r);
      },
    },
  ];
}

function hasKey(v?: string) {
  return !!v && !v.startsWith("your_");
}

export async function runAgent(goal: string, emit: Emit): Promise<void> {
  const toolDefs = tools();
  try {
    if (hasKey(process.env.LLM_API_KEY)) {
      await runLLM(goal, toolDefs, emit);
    } else {
      await runScripted(toolDefs, emit);
    }
    emit({ type: "done" });
  } catch (e) {
    emit({ type: "error", message: String(e) });
  }
}

async function runLLM(goal: string, toolDefs: ToolDef[], emit: Emit) {
  const baseURL = process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
  const model = process.env.LLM_MODEL ?? "openai/gpt-oss-120b";
  emit({ type: "status", text: `Agent online · ${model}` });

  const openai = new OpenAI({ apiKey: process.env.LLM_API_KEY, baseURL });
  const oaTools: OpenAI.Chat.ChatCompletionTool[] = toolDefs.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const byName = new Map(toolDefs.map((t) => [t.name, t]));

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: goal },
  ];

  for (let turn = 0; turn < 8; turn++) {
    const resp = await openai.chat.completions.create({ model, messages, tools: oaTools, tool_choice: "auto" });
    const msg = resp.choices[0].message;
    if (msg.content?.trim()) emit({ type: "reasoning", text: msg.content.trim() });
    messages.push(msg);

    if (!msg.tool_calls?.length) break;
    for (const tc of msg.tool_calls) {
      if (tc.type !== "function") continue;
      const args = JSON.parse(tc.function.arguments || "{}");
      emit({ type: "tool_call", name: tc.function.name, args });
      const def = byName.get(tc.function.name);
      const result = def ? await def.handler(args) : `Unknown tool ${tc.function.name}`;
      emit({ type: "tool_result", text: result });
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }
}

async function runScripted(toolDefs: ToolDef[], emit: Emit) {
  const byName = new Map(toolDefs.map((t) => [t.name, t]));
  emit({ type: "status", text: "Agent online · scripted (no LLM key)" });
  emit({ type: "reasoning", text: "First I'll check my spending mandate." });
  emit({ type: "tool_call", name: "list_agents", args: {} });
  emit({ type: "tool_result", text: await byName.get("list_agents")!.handler({}) });

  emit({ type: "reasoning", text: "Now I'll request $300 for a Meta ads campaign (MCC 7311)." });
  const args = { agentId: "ad-buyer", task: "Meta ads campaign", amount: 300, currency: "USD", merchantCategory: "7311", merchantName: "Meta" };
  emit({ type: "tool_call", name: "request_funds", args });
  emit({ type: "tool_result", text: await byName.get("request_funds")!.handler(args) });
}
