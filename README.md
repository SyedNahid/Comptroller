# Comptroller — the Autonomous Treasury for Your AI Agent Workforce

> *Give your AI agents a wallet, not the keys to the vault.*

Comptroller is an autonomous treasury that funds a company's fleet of AI agents
just-in-time. When an agent needs to spend, it asks Comptroller instead of touching
the company account. Comptroller checks a per-task **mandate**, converts funds to the
right currency at interbank **FX**, issues a **single-use, merchant/amount-scoped
Visa virtual card**, authorizes or declines each charge against the live mandate,
**claws back** residual funds, and **auto-reconciles** every charge to its agent+task
with an immutable audit trail.

Built on **Airwallex** for the Agentic Banking Hackathon (track: *Adaptive Treasury
Controller*).

## Status
- ✅ Treasury + FX: live on the Airwallex sandbox (auth, balances, real conversions)
- ✅ Mandate engine (deterministic AUTO_APPROVE / NEEDS_HUMAN / DENY)
- ✅ Ledger + immutable audit log (`node:sqlite`)
- ✅ Comptroller service: fund → FX convert → scoped card → clawback → reconcile
- ✅ Mission-control dashboard + API routes
- 🚫 Card issuance: awaiting Airwallex issuing-program enablement (stubbed behind a
  `CardIssuer` interface; drops in when enabled)
- ⏳ MCP server + Claude agent loop (in progress)

## Quick start
```bash
npm install
cp .env.example .env.local   # add your Airwallex sandbox keys
npm run dev                  # dashboard at http://localhost:3000
```

Scripts:
```bash
npm run spike         # verify sandbox connectivity (auth, balances, FX, issuing)
npm run demo:mandate  # mandate engine + ledger (no network)
npm run demo:e2e      # full loop against live sandbox FX
```

## Architecture
See [`docs/`](./docs): `CONTEXT.md` (the why), `ARCHITECTURE.md` (components +
endpoints), `STATUS.md` (progress), `FIXES.md` (gotchas), `SUPPORT_REQUEST.md`
(Airwallex enablement).

Key modules:
- `src/lib/airwallex/` — typed Airwallex client (auth cache, FX, issuing)
- `src/lib/mandate/` — deterministic mandate engine (the trust core)
- `src/lib/ledger/` — SQLite ledger + audit
- `src/lib/comptroller/` — orchestration service + CardIssuer (stub/live)
- `src/app/` — mission-control dashboard + API routes

## Security
Secrets live only in `.env.local` (gitignored). Never commit API keys.
