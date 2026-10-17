"use client";

import { formatMoney } from "@/lib/money";
import { DECISION_STYLE, AUDIT_STYLE, type State } from "./types";

export function MissionControl({
  state,
  busy,
  run,
  post,
}: {
  state: State | null;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  post: (url: string, body?: unknown) => Promise<void>;
}) {
  const pending = state?.requests.filter((r) => r.status === "PENDING_APPROVAL") ?? [];

  return (
    <>
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
              <p className="text-xs text-zinc-600">No requests yet — hit “Run demo” or use the Agent Console.</p>
            )}
          </div>
        </section>

        {/* Audit timeline */}
        <section>
          <h2 className="text-xs uppercase text-zinc-500 mb-3">Audit timeline</h2>
          <div className="space-y-1.5">
            {(state?.audit ?? []).map((a) => (
              <div key={a.id} className="text-[11px] leading-relaxed">
                <span className={`font-semibold ${AUDIT_STYLE[a.type] ?? "text-zinc-400"}`}>{a.type}</span>{" "}
                <span className="text-zinc-400">{a.message}</span>
              </div>
            ))}
            {(state?.audit.length ?? 0) === 0 && <p className="text-xs text-zinc-600">Quiet.</p>}
          </div>
        </section>
      </main>
    </>
  );
}
