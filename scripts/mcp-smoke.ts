/**
 * Smoke test for the Comptroller MCP server: spawns it over stdio, lists tools,
 * and calls a couple. Proves the MCP surface works end to end.
 *
 * Run:  npm run mcp:smoke
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/mcp/server.ts"],
  });
  const client = new Client({ name: "comptroller-smoke", version: "1.0.0" });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log("Tools:", tools.tools.map((t) => t.name).join(", "));

  const agents = await client.callTool({ name: "list_agents", arguments: {} });
  console.log("\nlist_agents ->");
  console.log((agents.content as { text: string }[])[0].text);

  const funded = await client.callTool({
    name: "request_funds",
    arguments: { agentId: "ad-buyer", task: "MCP smoke ad spend", amount: 250, currency: "USD", merchantCategory: "7311", merchantName: "Meta" },
  });
  console.log("\nrequest_funds (ad-buyer $250 USD) ->");
  console.log((funded.content as { text: string }[])[0].text);

  const denied = await client.callTool({
    name: "request_funds",
    arguments: { agentId: "ad-buyer", task: "Off-mandate", amount: 50, currency: "USD", merchantCategory: "5812", merchantName: "Nobu" },
  });
  console.log("\nrequest_funds (off-mandate MCC) ->");
  console.log((denied.content as { text: string }[])[0].text);

  await client.close();
  console.log("\nMCP smoke OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
