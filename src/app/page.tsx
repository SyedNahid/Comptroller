"use client";

import { useEffect, useState, useCallback } from "react";
import type { State } from "./components/types";
import { Logo } from "./components/ui";
import { ProblemView } from "./components/ProblemView";
import { AgentConsole } from "./components/AgentConsole";
import { MissionControl } from "./components/MissionControl";
import { DelegationView } from "./components/DelegationView";
import { AirwallexProof } from "./components/AirwallexProof";

type View = "problem" | "agent" | "control" | "delegation" | "proof";

const NAV: { key: View; label: string }[] = [
  { key: "problem", label: "Overview" },
  { key: "agent", label: "Agent Console" },
  { key: "control", label: "Mission Control" },
  { key: "delegation", label: "Delegation" },
  { key: "proof", label: "Proof" },
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

  const live = !!state;

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-gray-900">
      {/* App bar */}
      <header className="sticky top-0 z-20 border-b border-gray-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-5">
            <Logo />
            <span className="hidden text-xs text-gray-400 sm:inline">treasury for AI agents</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-gray-500 sm:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-gray-300"}`} />
              {live ? "live" : "…"}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                state?.issuingKind === "live"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-600/10"
                  : "bg-amber-50 text-amber-700 ring-amber-600/10"
              }`}
            >
              issuing: {state?.issuingKind ?? "…"}
            </span>
            <button
              disabled={busy}
              onClick={() => run(() => post("/api/demo"))}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
            >
              Run demo
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => post("/api/reset"))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>
        {/* Nav */}
        <div className="mx-auto max-w-6xl px-2 sm:px-5">
          <nav className="flex gap-1 overflow-x-auto">
            {NAV.map((n) => (
              <button
                key={n.key}
                onClick={() => setView(n.key)}
                className={`relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition ${
                  view === n.key ? "text-indigo-600" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {n.label}
                {view === n.key && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-600" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {view === "problem" && <ProblemView onStart={() => setView("agent")} />}
        {view === "agent" && <AgentConsole onActivity={refresh} />}
        {view === "control" && <MissionControl state={state} busy={busy} run={run} post={post} />}
        {view === "delegation" && <DelegationView state={state} busy={busy} run={run} post={post} />}
        {view === "proof" && <AirwallexProof state={state} />}
      </main>
    </div>
  );
}
