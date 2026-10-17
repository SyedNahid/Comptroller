"use client";

export function ProblemView({ onStart }: { onStart: () => void }) {
  return (
    <div className="max-w-3xl mx-auto py-10 px-6 space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          AI agents are spending real money.
          <br />
          <span className="text-zinc-500">Who&apos;s the adult in the room?</span>
        </h2>
      </div>

      <div className="grid gap-3">
        {[
          ["🔥", "Uber gave engineers AI agents and burned its entire 2026 AI budget by April."],
          ["📈", "Ramp customers' monthly AI token spend is up 13× since Jan 2025 — one prompt change can triple a bill overnight."],
          ["🏦", "“AI agents need permissioned funding sources, not company bank accounts.” — PYMNTS"],
          ["🔗", "When Agent A delegates to Agent B, spending authority compounds with no single oversight point."],
        ].map(([icon, text]) => (
          <div key={text} className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <span className="text-xl">{icon}</span>
            <p className="text-sm text-zinc-300">{text}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm text-zinc-400">
          The naive fix — hand an agent the company card — means{" "}
          <span className="text-rose-400">no per-agent limits</span>,{" "}
          <span className="text-rose-400">the wrong currency</span>,{" "}
          <span className="text-rose-400">runaway spend</span>, and{" "}
          <span className="text-rose-400">zero audit</span>.
        </p>
      </div>

      <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-6">
        <h3 className="text-xl font-semibold text-emerald-300">Comptroller</h3>
        <p className="mt-2 text-sm text-zinc-300">
          A treasury that funds your AI agents just-in-time: a deterministic{" "}
          <b>mandate</b> decides every request, funds convert to the right currency at
          interbank <b>FX</b>, land on a <b>single-use scoped Visa card</b>, and unused
          funds are <b>clawed back</b> — with a full <b>audit trail</b>.
        </p>
        <p className="mt-3 text-base font-semibold text-emerald-200">
          &ldquo;Give your AI agents a wallet, not the keys to the vault.&rdquo;
        </p>
        <button
          onClick={onStart}
          className="mt-5 px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold"
        >
          See it live →
        </button>
      </div>
    </div>
  );
}
