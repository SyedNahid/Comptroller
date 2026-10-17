/**
 * External spending agent — the showpiece.
 *
 * A REAL Claude agent connects to the Comptroller MCP server and autonomously
 * spends through its governed wallet: it reasons about a goal, calls `request_funds`
 * (and other tools), and reacts to AUTO_APPROVE / NEEDS_HUMAN / DENY. Every action
 * flows through the mandate engine + ledger, so it shows up live on the dashboard.
 *
 * Run:  npm run agent            (uses a default goal)
 *       npm run agent -- "your goal here"
 *
 * Needs ANTHROPIC_API_KEY in .env. Without it, falls back to a scripted agent that
 * calls the same MCP tools directly (so the demo still works).
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const MODEL = process.env.COMPTROLLER_AGENT_MODEL ?? "claude-sonnet-4-6";

const DEFAULT_GOAL =
  "You are the Ad Buyer Agent (agentId 'ad-buyer'). Launch a $300 Meta ads campaign " +
  "(merchant category 7311). First check your mandate with list_agents, then request " +
  "the funds. If denied or sent for approval, explain why. Keep going until the task is done.";

function toolText(res: unknown): string {
  const content = (res as { content?: { type: string; text?: string }[] }).content;
  if (!Array.isArray(content)) return "";
  return content.map((b) => b.text ?? "").join("\n");
}

async function connectMcp() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/mcp/server.ts"],
  });
  const client = new Client({ name: "comptroller-agent", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

async function runWithClaude(goal: string, client: Client) {
  const anthropic = new Anthropic();
  const { tools } = await client.listTools();
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: goal }];

  for (let turn = 0; turn < 8; turn++) {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools: anthropicTools,
      messages,
    });

    for (const block of resp.content) {
      if (block.type === "text" && block.text.trim()) {
        console.log(`\n🧠 ${block.text.trim()}`);
      }
    }

    if (resp.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: resp.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type === "tool_use") {
        console.log(`\n🛠️  ${block.name}(${JSON.stringify(block.input)})`);
        const res = await client.callTool({
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
        const text = toolText(res);
        console.log(`   → ${text.replace(/\n/g, "\n     ")}`);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: text });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
}

async function runScripted(client: Client) {
  console.log("(no ANTHROPIC_API_KEY — running scripted agent)\n");
  console.log("🧠 Checking my mandate…");
  console.log("   → " + toolText(await client.callTool({ name: "list_agents", arguments: {} })));
  console.log("\n🧠 Requesting $300 for a Meta campaign…");
  const r = await client.callTool({
    name: "request_funds",
    arguments: { agentId: "ad-buyer", task: "Meta ads campaign", amount: 300, currency: "USD", merchantCategory: "7311", merchantName: "Meta" },
  });
  console.log("   → " + toolText(r));
}

async function main() {
  const goal = process.argv.slice(2).join(" ") || DEFAULT_GOAL;
  const key = process.env.ANTHROPIC_API_KEY;
  const haveKey = !!key && !key.startsWith("your_");

  const client = await connectMcp();
  try {
    if (haveKey) await runWithClaude(goal, client);
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
