import { runAgent, type AgentEvent } from "@/lib/agent/loop";

export const runtime = "nodejs";

/**
 * Runs the agent and streams its events as Server-Sent Events so the Agent Console
 * can render the live reasoning + tool calls.
 *
 * POST /api/agent/stream  { goal?: string }
 */
export async function POST(req: Request) {
  let goal = "";
  try {
    const body = await req.json();
    goal = typeof body?.goal === "string" ? body.goal : "";
  } catch {
    // no body — use default goal below
  }
  if (!goal) {
    goal =
      "You are the Ad Buyer Agent (agentId 'ad-buyer'). Launch a $300 Meta ads campaign " +
      "(merchant category 7311). First check your mandate with list_agents, then request the " +
      "funds with request_funds. Report the outcome.";
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      await runAgent(goal, send);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
