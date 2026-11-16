"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { AgentPolicy, State } from "./types";
import { Card, Pill } from "./ui";

export function DelegationView({
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
  const agents = state?.agents ?? [];
  const mandates = state?.mandates ?? {};
  const [parent, setParent] = useState("ad-buyer");
  const [childName, setChildName] = useState("");
  const [cap, setCap] = useState("100");

  // Build parent → children map from mandate issuer links.
  const childrenOf: Record<string, AgentPolicy[]> = {};
  const roots: AgentPolicy[] = [];
  for (const a of agents) {
    const issuer = mandates[a.agentId]?.issuer ?? "operator";
    if (issuer === "operator") roots.push(a);
    else (childrenOf[issuer] ??= []).push(a);
  }

  const node = (a: AgentPolicy, depth: number): React.ReactNode => {
    const m = mandates[a.agentId];
    const kids = childrenOf[a.agentId] ?? [];
    return (
      <div key={a.agentId} style={{ marginLeft: depth * 22 }} className="relative">
        {depth > 0 && <span className="absolute -left-3 top-5 h-px w-3 bg-gray-300" />}
        <Card className="mb-2 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{a.displayName}</span>
            {m?.verified ? (
              depth === 0 ? <Pill tone="emerald">🔐 root · operator-signed</Pill> : <Pill tone="violet">🔗 delegated · depth {m.depth}</Pill>
            ) : (
              <Pill tone="rose">⚠ {m?.reason ?? "invalid"}</Pill>
            )}
            <span className="ml-auto flex gap-2">
              <button
                disabled={busy}
                onClick={() => setParent(a.agentId)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
              >
                delegate →
              </button>
              <button
                disabled={busy}
                onClick={() => run(() => post("/api/mandate/revoke", { agentId: a.agentId }))}
                className="text-xs font-medium text-rose-600 hover:text-rose-500 disabled:opacity-50"
              >
                revoke
              </button>
            </span>
          </div>
          <div className="nums mt-1 text-xs text-gray-500">
            per-task {formatMoney(a.perTaskCapMinor, a.baseCurrency)} · daily {formatMoney(a.dailyCapMinor, a.baseCurrency)} · MCC{" "}
            {a.allowedMerchantCategories.join(", ") || "any"}
          </div>
        </Card>
        {kids.map((k) => node(k, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Delegation</h1>
        <p className="max-w-2xl text-sm text-gray-500">
          The only treasury where one agent can safely <b>hire</b> another. A parent mints a
          cryptographically <b>attenuated</b> sub-mandate (cap ≤ parent, merchants ⊆ parent),
          signed with its own key — a verifiable chain to the human operator.{" "}
          <b>Revoke a parent and its whole subtree dies.</b>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Authority chain</h2>
          <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Pill tone="indigo">🔑 operator root</Pill>
              <span className="nums text-xs text-gray-400">{state?.operatorFingerprint}</span>
            </div>
            {roots.map((r) => node(r, 0))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Delegate a sub-budget</h2>
          <Card className="space-y-3 p-4">
            <label className="block text-xs font-medium text-gray-500">
              Parent agent
              <select
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
              >
                {agents.map((a) => (
                  <option key={a.agentId} value={a.agentId}>{a.agentId}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-gray-500">
              Child agent id
              <input
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder={`${parent}/sub-agent`}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-gray-500">
              Per-task cap (major units)
              <input
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm nums"
              />
            </label>
            <button
              disabled={busy || !childName.trim() || !cap.trim()}
              onClick={() =>
                run(async () => {
                  await post("/api/mandate/delegate", {
                    parentAgentId: parent,
                    childAgentId: childName.trim(),
                    perTaskCap: Number(cap),
                  });
                  setChildName("");
                })
              }
              className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "Minting…" : "Mint sub-mandate"}
            </button>
            <p className="text-xs text-gray-400">
              Inherits the parent’s currency + merchant scope. Exceed the parent’s cap and the
              mint is rejected cryptographically.
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
