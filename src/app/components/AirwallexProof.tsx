"use client";

import { formatMoney } from "@/lib/money";
import type { State } from "./types";

export function AirwallexProof({ state }: { state: State | null }) {
  const saved = state ? formatMoney(state.totalSavedMinor, "USD") : "—";
  return (
    <div className="max-w-3xl mx-auto py-10 px-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Proof: it&apos;s real money</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Comptroller&apos;s FX conversions execute on the live Airwallex sandbox — not a
          mock. Open the Airwallex dashboard and you&apos;ll see the exact conversions.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="text-[11px] uppercase text-zinc-500">Treasury balances (live)</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(state?.balances ?? []).map((b) => (
              <span key={b.currency} className="px-2 py-1 rounded bg-zinc-800 text-xs tabular-nums">
                {b.currency} {b.available_amount.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-4">
          <div className="text-[11px] uppercase text-zinc-500">Est. FX saved vs bank</div>
          <div className="mt-2 text-3xl font-bold text-emerald-400 tabular-nums">{saved}</div>
        </div>
      </div>

      <ol className="list-decimal list-inside text-sm text-zinc-300 space-y-1">
        <li>Open the Airwallex sandbox web app → <b>FX / Conversions</b>.</li>
        <li>Each approved request here created a real conversion there (match the timestamps / IDs).</li>
        <li>
          Card issuance is <b>one flag away</b> (<code className="text-xs bg-zinc-800 px-1 rounded">COMPTROLLER_ISSUING=live</code>)
          once Airwallex enables the sandbox issuing program.
        </li>
      </ol>

      <a
        href="https://www.airwallex.com/app/login"
        target="_blank"
        rel="noreferrer"
        className="inline-block px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm"
      >
        Open Airwallex dashboard ↗
      </a>
    </div>
  );
}
