"use client";

import { formatMoney } from "@/lib/money";
import type { State } from "./types";
import { Card, Pill } from "./ui";

export function AirwallexProof({ state }: { state: State | null }) {
  const saved = state ? formatMoney(state.totalSavedMinor, "USD") : "—";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Pill tone="emerald">Live sandbox</Pill>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">It’s real money</h1>
        <p className="text-sm text-gray-500">
          Comptroller’s FX conversions execute on the live Airwallex sandbox — not a mock.
          Open the Airwallex dashboard and you’ll see the exact conversions.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Treasury balances (live)</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(state?.balances ?? []).map((b) => (
              <span key={b.currency} className="nums rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-700 ring-1 ring-inset ring-gray-200">
                {b.currency} {b.available_amount.toLocaleString()}
              </span>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Est. FX saved vs bank</div>
          <div className="nums mt-1 text-4xl font-semibold text-emerald-600">{saved}</div>
        </Card>
      </div>

      {(state?.transfers?.length ?? 0) > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Real supplier payouts (live transfers)</div>
            <Pill tone="teal">money moved</Pill>
          </div>
          <div className="mt-3 divide-y divide-gray-100">
            {state!.transfers!.slice(0, 6).map((t, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">{t.beneficiary}</span>
                <span className="flex items-center gap-3">
                  <span className="nums text-gray-500">{formatMoney(t.amount_minor, t.currency)}</span>
                  <span className="nums text-xs text-gray-400">{t.short_ref ?? t.transfer_id?.slice(0, 8)}</span>
                  <Pill tone="emerald">{t.status}</Pill>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <ol className="list-inside list-decimal space-y-1.5 text-sm text-gray-600">
          <li>Open the Airwallex sandbox web app → <b>FX / Conversions</b>.</li>
          <li>Each approved request here created a real conversion there (match the timestamps / IDs).</li>
          <li>
            Card issuance is <b>one flag away</b>{" "}
            (<code className="rounded bg-gray-100 px-1 py-0.5 text-xs">COMPTROLLER_ISSUING=live</code>) once Airwallex
            enables the sandbox issuing program.
          </li>
        </ol>
        <a
          href="https://www.airwallex.com/app/login"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Open Airwallex dashboard ↗
        </a>
      </Card>
    </div>
  );
}
