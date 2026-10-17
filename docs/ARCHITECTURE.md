# Comptroller — Architecture

## Stack
TypeScript **Next.js** monorepo (App Router, `src/` dir, Tailwind). API routes host
the agent tools + webhook handler; React app is the dashboard. Deploy: Vercel.
Agent: Claude via Anthropic SDK. Real-time UI via SSE/websockets.

## Components

### 1. `airwallex-client` — `src/lib/airwallex/client.ts` (BUILT)
Typed client. Handles auth + token caching (reuse ~25 min), generic `request()`,
and wrappers. Build from env via `airwallexFromEnv()`.

### 2. Mandate engine (deterministic — source of truth) — TODO
Per-agent policy: daily/task caps, MCC allow-list, currency, auto-approve threshold.
`evaluate({agentId, task, amount, currency, merchant}) → {decision, requiresHuman, reason}`.
**The LLM never has the final say on money movement — this does.**

### 3. Comptroller agent (Claude tool-calling) — TODO
Turns an agent's NL funding request into: forecast → mandate check → FX convert →
issue scoped card → return credential. Tools = airwallex-client functions.

### 4. MCP server (showpiece) — TODO
Exposes treasury as MCP tools so any external agent gets a governed wallet. Demo
connects a real separate Claude agent that requests + spends through it.

### 5. Remote-auth webhook handler — TODO (upgrade, not dependency)
`/api/airwallex/remote-auth`: verify HMAC (`x-nonce`, `x-signature`), re-run mandate,
respond within 2.5s with `{card_transaction_event_id, response_status}`. No-op if disabled.

### 6. Ledger / audit — TODO
Tables: `agents`, `policies`, `fund_requests`, `conversions`, `cards`,
`authorizations`, `clawbacks`, `audit_log`. Start with SQLite; Postgres if time.

### 7. Dashboard (mission control) — TODO
Fleet view, live balances, one-tap approvals, per-task spend, audit timeline,
"saved $X" counter, clawback/reconcile animation.

### 8. Simulated spending agents — TODO
ad-buyer (USD/Meta), SaaS-procurement (EUR), data-vendor (GBP) — POST funding requests.

## Airwallex endpoints (verified from docs)
Base: `https://api.sandbox.airwallex.com`

| Purpose | Method | Path | Notes |
|---|---|---|---|
| Auth | POST | `/api/v1/authentication/login` | headers `x-client-id`, `x-api-key` → Bearer, ~30 min |
| Balances | GET | `/api/v1/balances/current` | confirm in spike |
| FX rate | GET | `/api/v1/fx/rates/current` | `buy_currency`, `sell_currency`, `sell_amount?` |
| FX quote | POST | `/api/v1/fx/quotes/create` | locked rate, `validity` e.g. `HR_24`, returns `quote_id` + `rate_details` (AWX vs CLIENT) |
| Conversion | POST | `/api/v1/conversions/create` | `request_id` idempotency; sell debits now, buy credits on `conversion_date` |
| Cardholder | POST | `/api/v1/issuing/cardholders/create` | confirm fields in spike |
| Card | POST | `/api/v1/issuing/cards/create` | authorization controls: amount/MCC/currency/single-use |
| Card txns | GET | `/api/v1/issuing/transactions` | reconciliation source |
| Simulate txn | ? | (TBD) | sandbox only — find exact endpoint in spike |

> ⚠️ Issuing paths/fields and the simulate-transaction endpoint are to be confirmed
> against live sandbox responses during the Week-0 spike; update this table then.

## Airwallex official resources (from Builder Guide)
- **Support / enablement:** `devhelp@airwallex.com` (feature enablement, troubleshooting).
- **Docs MCP (no login):** `https://mcp.sandbox.airwallex.com/docs` — query for accurate
  API schemas (faster than the JS-rendered doc site).
- **Developer MCP:** `https://mcp.sandbox.airwallex.com/developer` — sandbox API calls.
- **API versions:** FX = `2024-04-30`; Issuing = `2024-01-31` (sent via `x-api-version`).

## Repo layout (current)
```
comptroller/
  src/
    app/                 # Next.js app router (dashboard + API routes)
    lib/airwallex/
      client.ts          # BUILT
  scripts/
    spike.ts             # BUILT — stepwise sandbox validator (npm run spike)
  docs/                  # CONTEXT / ARCHITECTURE / STATUS / FIXES
  .env.example           # credential template (.env.local is gitignored)
```
