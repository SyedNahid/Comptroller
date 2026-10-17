/**
 * External spending agent — the showpiece.
 *
 * A real LLM agent connects to the Comptroller MCP server and autonomously spends
 * through its governed wallet: it reasons about a goal, calls `request_funds` (and
 * other tools), and reacts to AUTO_APPROVE / NEEDS_HUMAN / DENY. Every action flows
 * through the mandate engine + ledger, so it shows up live on the dashboard.
 *
 * Provider-agnostic — pick whichever you have (all free options work):
 *   • Groq (free, fast):   LLM_API_KEY=gsk_...  (defaults: Groq base + llama-3.3-70b)
 *   • Google Gemini:       LLM_API_KEY=...  LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai  LLM_MODEL=gemini-2.0-flash
 *   • OpenRouter:          LLM_API_KEY=...  LLM_BASE_URL=https://openrouter.ai/api/v1  LLM_MODEL=...
 *   • Ollama (local, free): LLM_API_KEY=ollama  LLM_BASE_URL=http://localhost:11434/v1  LLM_MODEL=llama3.1
 *   • Anthropic:           ANTHROPIC_API_KEY=...  (uses Claude)
 *   • none:                scripted fallback (still exercises the MCP wallet)
 *
 * Run:  npm run agent            (default goal)
 *       npm run agent -- "your goal"
 */

import "dotenv/config";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DEFAULT_GOAL =
  "You are the Ad Buyer Agent (agentId 'ad-buyer'). Launch a $300 Meta ads campaign " +
  "(merchant category 7311). First check your mandate with list_agents, then request " +
  "the funds with request_funds. If denied or sent for approval, explain why. Stop once done.";

const SYSTEM =
  "You are an autonomous AI agent with a corporate wallet governed by Comptroller. " +
  "You cannot touch the company bank account directly — you must request funds via the " +
  "tools. Think step by step, call tools to accomplish the goal, and clearly report the " +
  "outcome of each funding decision.";

function toolText(res: unknown): string {
  const content = (res as { content?: { type: string; text?: string }[] }).content;
  if (!Array.isArray(content)) return "";
  return content.map((b) => b.text ?? "").join("\n");
}

async function connectMcp() {
  const transport = new StdioClientTransport({ command: "npx", args: ["tsx", "src/mcp/server.ts"] });
  const client = new Client({ name: "comptroller-agent", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

/** OpenAI-compatible loop (Groq / Gemini / OpenRouter / Ollama / OpenAI). */
async function runOpenAICompatible(goal: string, client: Client) {
  const baseURL = process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
  const model = process.env.LLM_MODEL ?? "llama-3.3-70b-versatile";
  const openai = new OpenAI({ apiKey: process.env.LLM_API_KEY, baseURL });
  console.log(`(LLM: ${model} @ ${baseURL})\n`);

  const { tools } = await client.listTools();
  const oaTools: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: (t.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
    },
  }));

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: goal },
  ];

  for (let turn = 0; turn < 8; turn++) {
    const resp = await openai.chat.completions.create({ model, messages, tools: oaTools, tool_choice: "auto" });
    const msg = resp.choices[0].message;
    if (msg.content) console.log(`\n🧠 ${msg.content.trim()}`);
    messages.push(msg);

    if (!msg.tool_calls?.length) break;
    for (const tc of msg.tool_calls) {
      if (tc.type !== "function") continue;
      const args = JSON.parse(tc.function.arguments || "{}");
      console.log(`\n🛠️  ${tc.function.name}(${JSON.stringify(args)})`);
      const res = await client.callTool({ name: tc.function.name, arguments: args });
      const text = toolText(res);
      console.log(`   → ${text.replace(/\n/g, "\n     ")}`);
      messages.push({ role: "tool", tool_call_id: tc.id, content: text });
    }
  }
}

/** Scripted fallback — no LLM key needed. */
async function runScripted(client: Client) {
  console.log("(no LLM key — running scripted agent)\n");
  console.log("🧠 Checking my mandate…");
  console.log("   → " + toolText(await client.callTool({ name: "list_agents", arguments: {} })));
  console.log("\n🧠 Requesting $300 for a Meta campaign…");
  const r = await client.callTool({
    name: "request_funds",
    arguments: { agentId: "ad-buyer", task: "Meta ads campaign", amount: 300, currency: "USD", merchantCategory: "7311", merchantName: "Meta" },
  });
  console.log("   → " + toolText(r));
}

function hasKey(v?: string) {
  return !!v && !v.startsWith("your_");
}

async function main() {
  const goal = process.argv.slice(2).join(" ") || DEFAULT_GOAL;
  const client = await connectMcp();
  try {
    if (hasKey(process.env.LLM_API_KEY)) await runOpenAICompatible(goal, client);
    else await runScripted(client);
  } finally {
    await client.close();
  }
  console.log("\nAgent run complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
