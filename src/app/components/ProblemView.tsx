"use client";

import { Card, Pill } from "./ui";

const PAINS: [string, string][] = [
  ["🔥", "Uber gave engineers AI agents and burned its entire 2026 AI budget by April."],
  ["📈", "Ramp customers' monthly AI token spend is up 13× since Jan 2025 — one prompt change can triple a bill overnight."],
  ["🏦", "“AI agents need permissioned funding sources, not company bank accounts.” — PYMNTS"],
  ["🔗", "When Agent A delegates to Agent B, spending authority compounds with no single oversight point."],
];

export function ProblemView({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section className="space-y-4 pt-4 text-center">
        <Pill tone="indigo">Agentic Banking · Airwallex</Pill>
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          AI agents are spending real money.
          <br />
          <span className="text-gray-400">Who’s the adult in the room?</span>
        </h1>
        <p className="mx-auto max-w-xl text-lg text-gray-500">
          Comptroller is the autonomous treasury that funds your fleet of AI agents —
          the right currency, a scoped single-use card, every charge governed and audited.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={onStart}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            See it live →
          </button>
          <span className="text-sm text-gray-400">“Give your agents a wallet, not the keys to the vault.”</span>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {PAINS.map(([icon, text]) => (
          <Card key={text} className="p-4">
            <div className="flex gap-3">
              <span className="text-xl">{icon}</span>
              <p className="text-sm leading-relaxed text-gray-600">{text}</p>
            </div>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 bg-gradient-to-br from-indigo-50 to-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">How Comptroller works</h2>
          <p className="mt-1 text-sm text-gray-500">
            Agents request funds — they never hold the company account.
          </p>
        </div>
        <ol className="divide-y divide-gray-100">
          {[
            ["Mandate check", "A deterministic, signed policy decides: approve, ask a human, or deny."],
            ["FX convert", "Just-in-time conversion to the agent’s currency at interbank rates."],
            ["Scoped card", "A single-use Visa card locked to amount + merchant category."],
            ["Clawback & reconcile", "Unused funds returned; every charge tied to its agent + task."],
          ].map(([t, d], i) => (
            <li key={t} className="flex items-start gap-3 p-4">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-medium text-gray-900">{t}</div>
                <div className="text-sm text-gray-500">{d}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
