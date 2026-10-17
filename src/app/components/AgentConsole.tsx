"use client";

import { useRef, useState } from "react";

interface Line {
  kind: "status" | "reasoning" | "tool_call" | "tool_result" | "error";
  text: string;
}

const DEFAULT_GOAL =
  "You are the Ad Buyer Agent (agentId 'ad-buyer'). Launch a $300 Meta ads campaign " +
  "(merchant category 7311). Check your mandate first, then request the funds.";

export function AgentConsole({ onActivity }: { onActivity: () => void }) {
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const push = (l: Line) => {
    setLines((prev) => [...prev, l]);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  };

  async function run() {
    setLines([]);
    setRunning(true);
    try {
      const res = await fetch("/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          const e = JSON.parse(line);
          if (e.type === "done") continue;
          if (e.type === "tool_call") push({ kind: "tool_call", text: `${e.name}(${JSON.stringify(e.args)})` });
          else if (e.type === "tool_result") push({ kind: "tool_result", text: e.text });
          else push({ kind: e.type, text: e.text ?? e.message });
          onActivity();
        }
      }
    } finally {
      setRunning(false);
      onActivity();
    }
  }

  const style: Record<Line["kind"], string> = {
    status: "text-zinc-500",
    reasoning: "text-sky-300",
    tool_call: "text-violet-300",
    tool_result: "text-emerald-300",
    error: "text-rose-400",
  };
  const label: Record<Line["kind"], string> = {
    status: "●",
    reasoning: "🧠",
    tool_call: "🛠️ ",
    tool_result: "→",
    error: "✗",
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Agent Console</h2>
        <p className="text-xs text-zinc-500">
          A real LLM agent reasons about a goal and spends through Comptroller&apos;s
          governed wallet. The same tools are exposed over <b>MCP</b> for external agents.
        </p>
      </div>

      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        rows={2}
        className="w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-sm"
      />
      <button
        onClick={run}
        disabled={running}
        className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-sm font-semibold disabled:opacity-50"
      >
        {running ? "Agent working…" : "▶ Run agent"}
      </button>

      <div
        ref={scrollRef}
        className="h-[55vh] overflow-y-auto rounded-lg border border-zinc-800 bg-black/40 p-4 space-y-2 font-mono text-xs"
      >
        {lines.length === 0 && <p className="text-zinc-600">Agent idle. Hit “Run agent”.</p>}
        {lines.map((l, i) => (
          <div key={i} className={style[l.kind]}>
            <span className="opacity-60">{label[l.kind]} </span>
            <span className="whitespace-pre-wrap break-words">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
