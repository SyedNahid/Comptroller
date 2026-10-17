"use client";

import { useEffect, useState, useCallback } from "react";
import { formatMoney } from "@/lib/money";
import type { State } from "./components/types";
import { ProblemView } from "./components/ProblemView";
import { AgentConsole } from "./components/AgentConsole";
import { MissionControl } from "./components/MissionControl";
import { AirwallexProof } from "./components/AirwallexProof";

type View = "problem" | "agent" | "control" | "proof";

const NAV: { key: View; label: string }[] = [
  { key: "problem", label: "1 · The Problem" },
  { key: "agent", label: "2 · Agent Console" },
  { key: "control", label: "3 · Mission Control" },
  { key: "proof", label: "4 · Airwallex Proof" },
];

async function post(url: string, body?: unknown) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default function App() {
  const [view, setView] = useState<View>("problem");
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      setState(await res.json());
    } catch {
      /* ignore transient */
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between sticky top-0 bg-zinc-950/90 backdrop-blur z-10">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold tracking-tight">
            COMPTROLLER<span className="text-zinc-600"> · treasury for AI agents</span>
          </h1>
          <nav className="hidden md:flex gap-1">
            {NAV.map((n) => (
              <button
                key={n.key}
                onClick={() => setView(n.key)}
                className={`px-3 py-1.5 rounded text-xs ${
                  view === n.key ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-[10px] text-zinc-500 uppercase">Est. FX saved</div>
            <div className="text-lg font-bold text-emerald-400 tabular-nums">
              {state ? formatMoney(state.totalSavedMinor, "USD") : "—"}
            </div>
          </div>
          <span
            className={`text-[10px] px-2 py-1 rounded ${
              state?.issuingKind === "live" ? "bg-emerald-900 text-emerald-300" : "bg-amber-900/50 text-amber-300"
            }`}
          >
            issuing: {state?.issuingKind ?? "…"}
          </span>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => run(() => post("/api/demo"))}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold disabled:opacity-50"
            >
              ▶ Run demo
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => post("/api/reset"))}
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* mobile nav */}
      <nav className="md:hidden flex gap-1 px-4 py-2 border-b border-zinc-900 overflow-x-auto">
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => setView(n.key)}
            className={`px-3 py-1.5 rounded text-xs whitespace-nowrap ${
              view === n.key ? "bg-zinc-800" : "text-zinc-500"
            }`}
          >
            {n.label}
          </button>
        ))}
      </nav>

      {view === "problem" && <ProblemView onStart={() => setView("agent")} />}
      {view === "agent" && <AgentConsole onActivity={refresh} />}
      {view === "control" && <MissionControl state={state} busy={busy} run={run} post={post} />}
      {view === "proof" && <AirwallexProof state={state} />}
    </div>
  );
}
