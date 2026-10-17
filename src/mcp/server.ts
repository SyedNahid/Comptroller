/**
 * Comptroller MCP server.
 *
 * Exposes the treasury as Model Context Protocol tools so ANY external AI agent
 * (Claude Desktop, our own agent, etc.) gets a *governed wallet*: it can request
 * funds, but every request passes through the deterministic mandate engine and is
 * recorded to the shared ledger — so actions show up live on the dashboard.
 *
 * Run (stdio):  npm run mcp
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getComptroller } from "../lib/comptroller/instance";
import { airwallexFromEnv } from "../lib/airwallex/client";
import { formatMoney, toMinor } from "../lib/money";

const server = new McpServer({ name: "comptroller", version: "0.1.0" });

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

server.registerTool(
  "list_agents",
  {
    title: "List agents",
    description: "List the AI agents and their spending mandates (caps, allowed currencies, allowed merchant categories).",
    inputSchema: {},
  },
  async () => {
    const { ledger } = getComptroller();
    return text(
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
);

server.registerTool(
  "get_balances",
  {
    title: "Get treasury balances",
    description: "Get the treasury's current multi-currency balances from Airwallex.",
    inputSchema: {},
  },
  async () => {
    try {
      const ax = airwallexFromEnv();
      const all = (await ax.getBalances()) as { currency: string; available_amount: number }[];
      return text(all.filter((b) => b.available_amount > 0).map((b) => `${b.currency}: ${b.available_amount}`));
    } catch (e) {
      return text(`Could not fetch balances: ${String(e)}`);
    }
  },
);

server.registerTool(
  "request_funds",
  {
    title: "Request funds",
    description:
      "Request funds from the treasury for a task. Comptroller checks the agent's mandate, converts FX, and issues a scoped single-use card if approved. Returns the decision (AUTO_APPROVE / NEEDS_HUMAN / DENY) and card details.",
    inputSchema: {
      agentId: z.string().describe("The requesting agent's id (see list_agents)"),
      task: z.string().describe("What the funds are for"),
      amount: z.number().positive().describe("Amount in major units (e.g. 400 = $400)"),
      currency: z.string().length(3).describe("ISO currency, e.g. USD, EUR, GBP"),
      merchantCategory: z.string().optional().describe("Merchant category code (MCC) the spend targets"),
      merchantName: z.string().optional().describe("Merchant name, for the audit trail"),
    },
  },
  async ({ agentId, task, amount, currency, merchantCategory, merchantName }) => {
    const { comptroller } = getComptroller();
    try {
      const r = await comptroller.fundRequest({
        agentId,
        task,
        amountMinor: toMinor(amount),
        currency,
        merchantCategory,
        merchantName,
      });
      return text(r);
    } catch (e) {
      return text(`Error: ${String(e)}`);
    }
  },
);

server.registerTool(
  "get_activity",
  {
    title: "Get activity",
    description: "Recent fund requests and the audit trail.",
    inputSchema: { limit: z.number().optional().describe("Max rows (default 15)") },
  },
  async ({ limit }) => {
    const { ledger } = getComptroller();
    const n = limit ?? 15;
    return text({
      requests: ledger.getFundRequests(n).map((r) => ({
        agent: r.agent_id,
        task: r.task,
        amount: formatMoney(r.amount_minor, r.currency),
        decision: r.decision,
        status: r.status,
      })),
      audit: ledger.getAuditLog(n).map((a) => `${a.type}: ${a.message}`),
    });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr so it doesn't corrupt the stdio protocol on stdout
  console.error("Comptroller MCP server running on stdio");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
