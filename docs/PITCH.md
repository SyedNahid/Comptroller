# Comptroller — Pitch & Demo Script

> *The Autonomous Treasury for Your AI Agent Workforce.*
> **"Give your AI agents a wallet, not the keys to the vault."**

---

## 0. Positioning (how we stand apart from the field)
The hackathon is crowded with **SME treasury controllers** (fund/convert/defer/escalate
for a human finance team) and **intent-bound purchase agents**. Comptroller is neither
a human-CFO tool nor a single card wrapper: it is **agent-native treasury + the
delegation layer** — infrastructure for when you run a *fleet* of autonomous agents
that spend, and those agents **delegate budgets to each other**. Our unique combination,
all working (not simulated): real Airwallex FX · signed Ed25519 mandates · **delegated
sub-mandates (capability attenuation)** · NL→policy authoring · a real LLM agent over
MCP. No single competitor has this stack.

## 1. The one-liner
Comptroller is a treasury that funds a company's fleet of AI agents just-in-time —
converting to the right currency, issuing single-use scoped cards, approving or
declining each charge against a per-task mandate, and auto-reconciling every cent —
so autonomous agents can spend at machine speed without ever touching the company
bank account.

## 2. The 30-second pitch
> AI agents are starting to spend real money — on ads, SaaS, data, APIs. Today the
> only way to let them is to hand over a company card: no per-agent limits, no
> currency control, no real-time oversight. Comptroller fixes that. Agents *request*
> funds instead of holding the card. A deterministic mandate engine decides —
> auto-approve, send for human approval, or deny. Approved requests get real FX
> conversion and a single-use Visa card scoped to the exact amount and merchant,
> then unused funds are clawed back and every charge is reconciled with a full audit
> trail. It's built on Airwallex, and a real AI agent spends through it live over MCP.

---

## 3. The pain points (why this matters now)

| Pain | Evidence |
|---|---|
| **Runaway agent spend** — no budget guardrails at machine speed | Uber rolled out Claude Code to ~5,000 engineers and **burned its entire 2026 AI budget by April**. |
| **Spend is exploding and unpredictable** | Average monthly token spend by Ramp customers is up **13× since Jan 2025**; a single prompt change can triple a bill overnight. |
| **Agents shouldn't hold company accounts** | PYMNTS: *"AI agents need permissioned funding sources, not company bank accounts."* |
| **Cascading authority** — Agent A delegates to Agent B | Spending authority compounds across the chain with **no single oversight point**. |
| **Wrong currency, bad FX** | Agents transact globally; naive card use eats 2–3% bank FX markup and leaves idle balances in the wrong currency. |
| **No audit / reconciliation** | Who spent what, for which task, under whose authority? Today: unanswerable. |

**The gap:** no *treasury* is built for machine-speed, multi-currency, many-agent
spend. The agentic-commerce wave (Google AP2, Visa Intelligent Commerce, x402) is all
about *letting* agents pay — nobody is governing the *money supply* behind them.

---

## 4. What it solves + how

| It solves… | …how |
|---|---|
| Runaway spend | **Deterministic mandate engine**: per-task cap, daily cap, auto-approve threshold. The LLM proposes; the engine decides. It is the final authority on money movement — never the model. |
| Over-permissioned agents | **Single-use, scoped Visa cards**: locked to one amount, one currency, one merchant category. The agent never holds a reusable company credential. |
| Wrong currency / FX cost | **Just-in-time FX** on Airwallex at interbank rates (real conversions in the demo), funding each card in the agent's spend currency. |
| No human control at the edge | **Human-in-the-loop**: requests above the threshold park as `NEEDS_HUMAN`; an operator approves with one tap. |
| Waste / idle funds | **Clawback**: on task completion the card is cancelled and residual funds returned. |
| No accountability | **Immutable audit log + reconciliation**: every decision, conversion, card, authorization and clawback is recorded and mapped to its agent + task. |
| Vendor lock-in / integration | **MCP server**: any external AI agent (Claude, Groq-hosted, etc.) plugs in and gets a *governed wallet* — no bespoke integration. |

### The core loop
`request-funds` → mandate.evaluate → (over threshold → human approval) → FX convert →
issue single-use scoped card → spend → authorize / **decline** → clawback residual →
reconcile to agent+task → audit entry.

---

## 5. The awe factor (what makes judges lean in)

0. **The one nobody else has — Delegated Mandates.** Comptroller is the only entry
   where **one agent can safely *hire* another**: a parent agent mints a
   cryptographically **attenuated** sub-mandate (cap ≤ parent, merchants ⊆ parent,
   expiry ≤ parent), signed with its own key, forming a verifiable authority chain to
   the human operator. **Revoke the parent → the whole subtree dies.** This directly
   solves the #1 *unsolved* problem in agentic payments for 2026 — *"authority passes
   down a chain… re-signed and narrowed at every hop; how a principal manages/revokes
   it remains largely unsolved."* Macaroons attenuate but can't express budgets; we do.
   Live-demoable: delegate → child spends within sub-budget → over sub-budget denied →
   illegal delegation blocked at mint → revoke parent → subtree void.
1. **It's real money, live.** Real Airwallex sandbox auth, balances, and **FX
   conversions** — then we cut to Airwallex's own dashboard showing the exact same
   conversion IDs. Not a mock.
2. **A real AI agent spends through it, autonomously.** A live LLM agent (free Groq)
   reasons about its goal and calls Comptroller over **MCP** — you watch it think and
   transact. Not a scripted button.
3. **The gasp moment — a live decline.** An agent tries to overspend or hit an
   off-mandate merchant and is **refused in real time**, with the reason shown.
4. **Trust you can see.** Per-task mandates + one-tap human approval + a self-filling
   audit timeline + an animated **"saved $X"** FX counter. Autonomy that looks
   *governed*, not reckless.
4b. **Tamper-evident authority (Ed25519).** Each agent's mandate is cryptographically
   signed by the operator (AP2 / Visa Trusted-Agent aligned). Edit a mandate without
   re-signing and Comptroller **refuses every spend** — live-demoable: tamper → all
   denied → re-sign → restored.
5. **On the frontier.** Treasury built *for the AI agents themselves* — riding the
   hottest 2026 fintech theme (agentic commerce) while everyone else builds dashboards
   for humans.
6. **Uniquely Airwallex.** Needs multi-currency wallet + interbank FX + programmatic
   **Visa** issuing with real-time controls — few stacks combine all three.

---

## 6. The interfaces (multi-screen story)

| # | View | Whose world | Purpose |
|---|---|---|---|
| 1 | **The Problem** | the audience | Frame the pain + stakes before any UI. |
| 2 | **Agent Console** | the AI agent | Live LLM reasoning + MCP tool calls — proves real autonomy. |
| 3 | **Mission Control** | the treasury operator | Fleet, balances, pending approvals, audit, savings — the adult in the room. |
| 4 | **Proof on Airwallex** | the real world | Airwallex sandbox web app showing the actual conversions. Credibility kill-shot. |

---

## 7. Demo run-of-show (~4.5 min, maps to the <5-min video)

**0:00 — The hook** *(Problem screen)*
> "In April 2026, Uber gave its engineers AI agents and burned its entire year's AI
> budget by spring. AI agents are spending real money now — but who's the adult in the
> room? Today, letting an agent pay means handing it the company card. That's the
> problem Comptroller solves."

**0:30 — Meet the fleet** *(Mission Control)*
> "Here's an AI marketing agency's fleet — an ad-buyer in USD, a SaaS agent in EUR, a
> data-vendor in GBP. Each has a mandate: caps, allowed currencies, allowed merchants.
> The treasury holds the reserve; agents must request funds."

**1:00 — A real agent spends** *(Agent Console)*
> "Watch a real LLM agent pursue a goal." Launch the ad-buyer → it reasons, calls
> `request_funds` for $300 of Meta ads → **AUTO_APPROVE** → single-use card issued.

**1:45 — The gasp (live decline)** *(Agent Console / Mission Control)*
> Agent tries an off-mandate merchant (or over its cap) → **DECLINED in real time**,
> reason on screen. "It can't spend outside its mandate — period."

**2:15 — Human in the loop** *(Mission Control)*
> SaaS agent needs €350 — above its auto-approve threshold → **NEEDS_HUMAN**. Operator
> taps **Approve** → a **real USD→EUR conversion fires on Airwallex** (interbank rate).

**3:00 — Settle, claw back, reconcile** *(Mission Control)*
> Agent spends → charge **authorized** → residual **clawed back**, card cancelled →
> audit timeline fills → **"saved $X"** FX counter ticks up.

**3:45 — Proof it's real** *(Airwallex tab)*
> Cut to the Airwallex sandbox dashboard: "These are the exact conversions Comptroller
> just made — real money, real FX." Close:
> **"Give your AI agents a wallet, not the keys to the vault."**

---

## 8. What's real vs simulated (say this — judges trust honesty)
- **Real / live:** Airwallex auth, balances, **FX conversions**; the **LLM agent**
  (Groq) reasoning + tool-calling; the mandate engine, ledger, audit, clawback logic.
- **Real / live (money movement):** governed **supplier payouts** execute as real
  Airwallex **transfers** (status + fee returned) through the mandate gate — undeniable
  money movement that works today, no card issuing required.
- **Simulated (one flag away):** card **issuance** and charge **authorization** — the
  sandbox issuing program isn't enabled yet (request sent to `devhelp@airwallex.com`).
  Code is ready behind a `CardIssuer` interface; flip `COMPTROLLER_ISSUING=live` to go
  real. Native card spend controls will enforce the same declines once enabled.

## 9. Live-demo reliability kit
- Record the **<5-min video as a safety net** (required deliverable anyway).
- **Reset** button for clean, repeatable runs.
- **Scripted no-key fallback** if Groq rate-limits mid-demo (`npm run agent` with no key).
- Run the dashboard **locally** so venue wifi can't kill it.
- Pre-warm: one dry run right before (token caches, FX reachable).

## 10. Prize fit
- **Founder's Choice / Judges Choice** (open) — the core product.
- **Visa Award** — single-use **Visa** cards with programmatic spend controls.
- **Claude credits** — swap the agent to Claude via its key for the final submission.
