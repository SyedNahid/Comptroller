"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { DECISION_TONE, AUDIT_META, RISK_TONE, type RiskStatus, type State } from "./types";
import { Card, Pill, useCountUp } from "./ui";

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
  const funded = state?.requests.filter((r) => r.status === "FUNDED" || r.status === "SETTLED").length ?? 0;
  const saved = useCountUp((state?.totalSavedMinor ?? 0) / 100);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const frozen = (state?.agents ?? []).filter((a) => state?.risk?.[a.agentId]?.frozen);

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-5 sm:col-span-2">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Estimated FX saved vs bank</div>
          <div className="mt-1 nums text-4xl font-semibold text-emerald-600">
            ${saved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xs text-gray-400">across {state?.conversions?.length ?? 0} live conversions</div>
        </Card>
        <Stat label="Agents" value={String(state?.agents.length ?? 0)} />
        <Stat
          label="Pending"
          value={String(pending.length)}
          tone={pending.length ? "amber" : "gray"}
        />
      </div>

      {/* Circuit-breaker banner — the adaptive governor froze an agent */}
      {frozen.map((a) => {
        const r = state!.risk[a.agentId];
        return (
          <Card key={a.agentId} className="animate-flashred border-rose-300 bg-rose-50/60 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-rose-600 text-white">🛑</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-rose-800">
                  Circuit breaker tripped — {a.displayName} frozen
                </div>
                <div className="text-xs text-rose-700">
                  Behavioral risk {r.score}/100 ({r.band}). All spend is denied until an operator clears it.
                </div>
              </div>
              <button
                disabled={busy}
                onClick={() => run(() => post("/api/agent/clear", { agentId: a.agentId }))}
                className="ml-auto rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                Clear breaker
              </button>
            </div>
          </Card>
        );
      })}

      {/* Treasury balances */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Treasury</span>
          {(state?.balances ?? []).map((b) => (
            <span key={b.currency} className="nums rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-700 ring-1 ring-inset ring-gray-200">
              {b.currency} {b.available_amount.toLocaleString()}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-3">
            {state?.operatorFingerprint && (
              <span className="nums text-xs text-gray-400">🔑 {state.operatorFingerprint}</span>
            )}
            <button
              disabled={busy}
              onClick={() => run(() => post("/api/demo/attack", { agentId: "ad-buyer" }))}
              className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              title="Fire a burst of off-mandate requests to drive the adaptive governor live"
            >
              ⚠ Simulate compromised agent
            </button>
            <a href="/api/export/reconciliation" className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
              Export CSV ↓
            </a>
          </span>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Fleet */}
        <section className="space-y-3 lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-900">Agent fleet</h2>
          {(state?.agents ?? []).map((a) => {
            const m = state?.mandates?.[a.agentId];
            const delegated = (m?.issuer ?? "operator") !== "operator";
            return (
              <Card key={a.agentId} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">{a.displayName}</span>
                  <Pill tone="gray">{a.baseCurrency}</Pill>
                </div>
                <div className="mt-1 nums text-xs text-gray-500">
                  per-task {formatMoney(a.perTaskCapMinor, a.baseCurrency)} · auto ≤{" "}
                  {formatMoney(a.autoApproveThresholdMinor, a.baseCurrency)}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {m?.verified ? (
                    <Pill tone={delegated ? "violet" : "emerald"}>
                      {delegated ? `🔗 delegated · depth ${m.depth}` : "🔐 verified"}
                    </Pill>
                  ) : (
                    <Pill tone="rose">⚠ {m?.reason ?? "invalid"}</Pill>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => {
                      setEditing(editing === a.agentId ? null : a.agentId);
                      setText("");
                    }}
                    className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
                  >
                    edit policy
                  </button>
                </div>
                <RiskMeter r={state?.risk?.[a.agentId]} />
                {editing === a.agentId && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={2}
                      placeholder={`"Let ${a.agentId} spend up to $750/day on ads, auto-approve under $200"`}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700 focus:border-indigo-400 focus:outline-none"
                    />
                    <button
                      disabled={busy || !text.trim()}
                      onClick={() =>
                        run(async () => {
                          await post("/api/policy/compile", { agentId: a.agentId, text });
                          setEditing(null);
                          setText("");
                        })
                      }
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {busy ? "Compiling…" : "Compile & re-sign (AI)"}
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </section>

        {/* Requests + approvals */}
        <section className="space-y-3 lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-900">
            Fund requests {pending.length > 0 && <span className="text-amber-600">· {pending.length} pending</span>}
          </h2>
          {pending.map((r) => (
            <Card key={r.id} className="animate-rowin border-amber-200 bg-amber-50/40 p-4">
              <div className="text-sm font-medium text-gray-900">{r.agent_id} · {r.task}</div>
              <div className="nums text-xs text-gray-500">
                {formatMoney(r.amount_minor, r.currency)} → {r.merchant_name}
              </div>
              <button
                disabled={busy}
                onClick={() => run(() => post("/api/approve", { id: r.id }))}
                className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400 disabled:opacity-50"
              >
                ✋ Approve
              </button>
            </Card>
          ))}
          {(state?.requests ?? [])
            .filter((r) => r.status !== "PENDING_APPROVAL")
            .slice(0, 8)
            .map((r) => (
              <Card key={r.id} className={`p-3.5 ${r.decision === "DENY" ? "animate-flashred" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-900">{r.agent_id}</span>
                  <Pill tone={DECISION_TONE[r.decision] ?? "gray"}>{r.decision}</Pill>
                </div>
                <div className="nums text-xs text-gray-500">
                  {formatMoney(r.amount_minor, r.currency)}
                  {r.merchant_name ? ` → ${r.merchant_name}` : ""} · {r.task}
                </div>
              </Card>
            ))}
          {(state?.requests.length ?? 0) === 0 && (
            <p className="text-sm text-gray-400">No requests yet — click “Run demo” or use the Agent Console.</p>
          )}
        </section>

        {/* Activity feed */}
        <section className="space-y-3 lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-900">Activity</h2>
          <Card className="divide-y divide-gray-100 p-0">
            {(state?.audit ?? []).slice(0, 18).map((a) => {
              const meta = AUDIT_META[a.type] ?? { tone: "gray" as const, dot: "bg-gray-400" };
              return (
                <div key={a.id} className="flex items-start gap-2.5 p-3">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-gray-400">{a.type.replace(/_/g, " ")}</div>
                    <div className="text-xs text-gray-700">{a.message}</div>
                  </div>
                </div>
              );
            })}
            {(state?.audit.length ?? 0) === 0 && <div className="p-4 text-sm text-gray-400">Quiet.</div>}
          </Card>
        </section>
      </div>

      <p className="text-center text-xs text-gray-400">{funded} funded · deterministic mandate engine · immutable audit</p>
    </div>
  );
}

/** Live behavioral-risk meter for one agent — the Adaptive Loop made visible. */
function RiskMeter({ r }: { r?: RiskStatus }) {
  if (!r) return null;
  const rt = RISK_TONE[r.band] ?? { tone: "gray" as const, dot: "bg-gray-400" };
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="flex items-center gap-2">
        <Pill tone={rt.tone}>
          <span className={`h-1.5 w-1.5 rounded-full ${rt.dot}`} /> {r.band} · risk {r.score}
        </Pill>
        <span className="ml-auto nums text-xs text-gray-400">trust {r.trust}/100</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${rt.dot} transition-all duration-500`} style={{ width: `${r.score}%` }} />
      </div>
      {r.factors.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {r.factors.slice(0, 3).map((f) => (
            <li key={f.key} className="text-[11px] text-gray-500">
              • {f.label} <span className="text-gray-400">(+{f.points})</span> — {f.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "gray" }: { label: string; value: string; tone?: "gray" | "amber" }) {
  return (
    <Card className="p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 nums text-4xl font-semibold ${tone === "amber" ? "text-amber-600" : "text-gray-900"}`}>
        {value}
      </div>
    </Card>
  );
}
