# Comptroller — Context Memory

> Read this first to re-orient. It's the single source of truth for *what we're
> building and why*. Keep it current.

## The project
**Comptroller — the Autonomous Treasury for Your AI Agent Workforce.**
An autonomous treasury that funds a company's fleet of AI agents just-in-time:
checks a per-task **mandate**, converts funds to the right currency at interbank
FX, issues a **single-use, merchant/amount-scoped Visa virtual card**, authorizes
or declines each charge against the live mandate, **claws back** residual funds,
and **auto-reconciles** every charge to its agent+task with an immutable audit log.

One-liner: *"Give your AI agents a wallet, not the keys to the vault."*

## Why this wins (the wedge)
- Generic autonomous treasury (forecast + FX) is a **crowded** category (Concourse,
  Atlar, Bottomline) — judges see it as derivative.
- The open frontier is treasury **for the AI agents themselves** — the hottest 2026
  fintech theme (agentic commerce: AP2, Visa Intelligent Commerce, x402). Validated
  pain: Uber burned its entire 2026 AI budget by April; "AI agents need permissioned
  funding sources, not company bank accounts."
- Uniquely enabled by Airwallex: multi-currency wallet + interbank FX + programmatic
  **Visa** issuing with real-time authorization — few stacks combine all three.

## Hackathon facts
- Host: Airwallex. Track: **Adaptive Treasury Controller** (Treasury & Ops).
- Prizes targeted: Founder's Choice $30k + Judges Choice $20k (open) + **Visa Award
  $15k** (satisfied because Airwallex Issuing runs on Visa).
- Build window **Oct 25 – Nov 19, 2026**. Idea submission due **Oct 23**.
- Deliverables: working demo + **<5-min video** + repo with setup. Team 1–4. Retain IP.

## Decisions locked
- **Stack:** TypeScript / Next.js monorepo, deploy on Vercel.
- **Ambition:** the "awestruck" build — committed, not stretch:
  - **MCP server** exposing the treasury; a **real external Claude agent** spends
    through it live in the demo.
  - **Real-time "mission control" dashboard** (fleet stream, ticking balances, card
    materializes, live Claude reasoning trace, animated "saved $X", clawback/reconcile).
- **Title:** Comptroller (final).

## The one capability (core loop)
`request-funds` → mandate.evaluate → (over threshold → human approval) → FX
quote+convert → issue single-use scoped Visa card → return credential → spend
simulated → native-control / remote-auth **authorize or decline** → task ends →
cancel card (clawback) → reconcile to agent+task → audit entry.

## Critical risk (designed around)
**Remote Authorization** (dynamic approve/decline webhook) requires Airwallex
**Account Manager enablement** + 2.5s response + HMAC-signed webhooks. The demo must
NOT depend on it. Fallback = native card spend controls (MCC/amount/single-use)
produce *real* declines with zero enablement, plus a pre-issuance mandate gate.
Remote auth is an upgrade we request in parallel (task #4).

## Key links
- Builder Guide: https://airwallexdev.com
- Plan file: `~/.claude/plans/but-i-have-to-fizzy-wind.md`
- Endpoints + architecture: see `ARCHITECTURE.md`. Progress: `STATUS.md`. Gotchas: `FIXES.md`.
