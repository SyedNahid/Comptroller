"use client";

import { useEffect, useState, useCallback } from "react";
import { formatMoney } from "@/lib/money";

interface AgentPolicy {
  agentId: string;
  displayName: string;
  baseCurrency: string;
  allowedCurrencies: string[];
  allowedMerchantCategories: string[];
  perTaskCapMinor: number;
  dailyCapMinor: number;
  autoApproveThresholdMinor: number;
}
interface FundRequestRow {
  id: string;
  agent_id: string;
  task: string;
  amount_minor: number;
  currency: string;
  merchant_name: string | null;
  decision: string;
  status: string;
  reason: string;
}
interface AuditRow {
  id: number;
  ts: string;
  type: string;
  message: string;
}
interface Balance {
  currency: string;
  available_amount: number;
}
interface State {
  issuingKind: string;
  agents: AgentPolicy[];
  requests: FundRequestRow[];
  audit: AuditRow[];
  totalSavedMinor: number;
  balances: Balance[];
}

const DECISION_STYLE: Record<string, string> = {
  AUTO_APPROVE: "text-emerald-400",
  NEEDS_HUMAN: "text-amber-400",
  DENY: "text-rose-400",
};
const AUDIT_STYLE: Record<string, string> = {
  MANDATE_AUTO_APPROVE: "text-emerald-400",
  MANDATE_NEEDS_HUMAN: "text-amber-400",
  MANDATE_DENY: "text-rose-400",
  FX_CONVERTED: "text-sky-400",
  CARD_ISSUED: "text-violet-400",
  HUMAN_APPROVED: "text-amber-300",
  AUTH_AUTHORIZED: "text-emerald-400",
  AUTH_DECLINED: "text-rose-400",
  CLAWBACK: "text-teal-400",
};

async function post(url: string, body?: unknown) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default function Dashboard() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/state", { cache: "no-store" });
    setState(await res.json());
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

  const pending = state?.requests.filter((r) => r.status === "PENDING_APPROVAL") ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/90 backdrop-blur z-10">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            COMPTROLLER<span className="text-zinc-500"> · treasury for AI agents</span>
          </h1>
          <p className="text-[11px] text-zinc-500">
            issuing:{" "}
            <span className={state?.issuingKind === "live" ? "text-emerald-400" : "text-amber-400"}>
              {state?.issuingKind ?? "…"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[11px] text-zinc-500 uppercase">Est. FX saved</div>
            <div className="text-2xl font-bold text-emerald-400 tabular-nums">
              {state ? formatMoney(state.totalSavedMinor, "USD") : "—"}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => run(() => post("/api/demo"))}
              className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold disabled:opacity-50"
            >
              ▶ Run demo
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => post("/api/reset"))}
              className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* Treasury balances */}
      <section className="px-6 py-3 border-b border-zinc-900 flex gap-3 flex-wrap">
        <span className="text-[11px] text-zinc-500 uppercase self-center">Treasury</span>
        {(state?.balances ?? []).map((b) => (
          <span key={b.currency} className="px-2 py-1 rounded bg-zinc-900 text-xs tabular-nums">
            {b.currency} {b.available_amount.toLocaleString()}
          </span>
        ))}
      </section>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        {/* Fleet + approvals */}
        <section>
          <h2 className="text-xs uppercase text-zinc-500 mb-3">Agent fleet</h2>
          <div className="space-y-3">
            {(state?.agents ?? []).map((a) => (
              <div key={a.agentId} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">{a.displayName}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-zinc-800">{a.baseCurrency}</span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  per-task {formatMoney(a.perTaskCapMinor, a.baseCurrency)} · daily{" "}
                  {formatMoney(a.dailyCapMinor, a.baseCurrency)} · auto ≤{" "}
                  {formatMoney(a.autoApproveThresholdMinor, a.baseCurrency)}
                </div>
                <div className="text-[11px] text-zinc-600 mt-1">
                  MCC {a.allowedMerchantCategories.join(", ") || "any"}
                </div>
              </div>
            ))}
          </div>

          <h2 className="text-xs uppercase text-zinc-500 mt-6 mb-3">
            Pending approvals{" "}
            {pending.length > 0 && <span className="text-amber-400">({pending.length})</span>}
          </h2>
          <div className="space-y-2">
            {pending.length === 0 && <p className="text-xs text-zinc-600">None.</p>}
            {pending.map((r) => (
              <div key={r.id} className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3">
                <div className="text-sm">
                  {r.agent_id} · {r.task}
                </div>
                <div className="text-xs text-zinc-400">
                  {formatMoney(r.amount_minor, r.currency)} → {r.merchant_name}
                </div>
                <button
                  disabled={busy}
                  onClick={() => run(() => post("/api/approve", { id: r.id }))}
                  className="mt-2 px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-xs font-semibold disabled:opacity-50"
                >
                  ✋ Approve
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Requests */}
        <section>
          <h2 className="text-xs uppercase text-zinc-500 mb-3">Fund requests</h2>
          <div className="space-y-2">
            {(state?.requests ?? []).map((r) => (
              <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="flex justify-between">
                  <span className="text-sm">
                    {r.agent_id} · {r.task}
                  </span>
                  <span className={`text-xs font-semibold ${DECISION_STYLE[r.decision] ?? ""}`}>
                    {r.decision}
                  </span>
                </div>
                <div className="text-xs text-zinc-400">
                  {formatMoney(r.amount_minor, r.currency)}
                  {r.merchant_name ? ` → ${r.merchant_name}` : ""} ·{" "}
                  <span className="text-zinc-500">{r.status}</span>
                </div>
              </div>
            ))}
            {(state?.requests.length ?? 0) === 0 && (
              <p className="text-xs text-zinc-600">No requests yet — hit “Run demo”.</p>
            )}
          </div>
        </section>

        {/* Audit timeline */}
        <section>
          <h2 className="text-xs uppercase text-zinc-500 mb-3">Audit timeline</h2>
          <div className="space-y-1.5">
            {(state?.audit ?? []).map((a) => (
              <div key={a.id} className="text-[11px] leading-relaxed">
                <span className={`font-semibold ${AUDIT_STYLE[a.type] ?? "text-zinc-400"}`}>
                  {a.type}
                </span>{" "}
                <span className="text-zinc-400">{a.message}</span>
              </div>
            ))}
            {(state?.audit.length ?? 0) === 0 && <p className="text-xs text-zinc-600">Quiet.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
