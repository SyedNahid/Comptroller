# Comptroller — Status

_Last updated: 2026-10-17_

## Phase
**Week 0 — de-risk spike.** Treasury + FX rails PROVEN live. Card issuing blocked on
an Airwallex account-config step (not a code issue).

## Done
- ✅ Next.js + TS + Tailwind monorepo scaffolded; git initialized.
- ✅ `airwallex-client`: auth + token cache, generic request layer with `x-api-version`
  support, wrappers (balances, FX rate/quote/conversion, issuing).
- ✅ `scripts/spike.ts` + `npm run spike` — stepwise sandbox validator.
- ✅ `.env` with sandbox creds (gitignored). IP allowlisted.
- ✅ **Live: AUTH + BALANCES + FX RATE + real SETTLED CONVERSION** (tasks #1, #2).
- ✅ **Live: CARDHOLDER creation** works (status PENDING).
- ✅ **Mandate engine** (`src/lib/mandate/`) — deterministic AUTO_APPROVE / NEEDS_HUMAN
  / DENY with per-task cap, daily cap, currency + MCC checks. Pure + testable.
- ✅ **Ledger** (`src/lib/ledger/`) — `node:sqlite` (zero native deps), schema +
  audit log, daily-spend aggregation.
- ✅ **Fleet seed** (`src/lib/agents/seed.ts`) — ad-buyer / saas / data-vendor.
- ✅ **`npm run demo:mandate`** proves all 3 decision paths + audit end to end.
- ✅ **Comptroller service** (`src/lib/comptroller/`) — fundRequest / approve /
  simulateSpend, FX convert + CardIssuer interface (Stub + Airwallex impls).
- ✅ **`npm run demo:e2e`** — full loop on LIVE sandbox FX (USD→EUR/GBP), human
  approval, deny, authorize, clawback, savings tracking.
- ✅ **Mission-control dashboard** + API routes (state / fund-request / approve /
  spend / demo / reset). Verified live at http://localhost:3000 — ▶ Run demo,
  ✋ Approve, savings counter, audit timeline all working.
- ✅ **MCP server** (`src/mcp/server.ts`) — treasury as MCP tools (list_agents,
  get_balances, request_funds, get_activity). `npm run mcp:smoke` passes.
- ✅ **External Claude agent** (`scripts/agent.ts`) — connects over MCP, reasons, and
  spends through the governed wallet. `npm run agent` (scripted fallback without
  ANTHROPIC_API_KEY; real Claude tool-loop when a key is present).
- ✅ Pushed to GitHub: https://github.com/SyedNahid/Comptroller
- ✅ Typecheck clean. Next 16 `cacheComponents` disabled (see FIXES).
- ✅ Docs: CONTEXT / ARCHITECTURE / STATUS / FIXES / SUPPORT_REQUEST.

## All buildable pieces are DONE
Everything not gated on Airwallex issuing enablement is built + verified.

## Blocked / waiting
- 🚫 **Card issuance** (task #3) — account's **issuing program not configured**:
  PREPAID/DEBIT/DD_OTA rejected; GOOD_FUNDS_CREDIT → "Invalid issuance details".
  Needs Airwallex support to enable. Code path is ready.
- ⏳ **Remote Authorization** (task #4) — needs Account Manager. Demo doesn't depend
  on it (fallback = native spend-control declines, which also need issuing enabled).

## Next actions (in order)
1. **Send the Airwallex support request** (task #4) → enable issuing program + Remote
   Authorization. Critical-path unblock for the card half.
2. **Comptroller service layer**: wire mandate engine + ledger + FX convert into a
   single `fundRequest()` flow (AUTO_APPROVE → convert FX → record; NEEDS_HUMAN →
   pending; DENY → audit). Card issuance stubbed until enabled.
3. **Claude agent loop + MCP server** exposing the treasury tools.
4. **Mission-control dashboard** (Next.js API routes + React) reading the ledger.
5. On enablement: re-run spike → card issues → simulate-transaction → decline (task #3).

## Task list (mirror of tracker)
- #1 Week-0 connectivity spike — _in progress_
- #2 Real FX conversion — pending
- #3 Scoped card + decline — pending
- #4 Request Remote Authorization enablement — pending

## Definition of done (MVP demo)
Real FX conversion executes; scoped Visa card issued; one charge approved + one
declined; residual clawed back; every charge reconciled to agent+task; full audit log;
<5-min video + repo with one-command setup.
