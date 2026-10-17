# Comptroller — Fixes & Gotchas Log

A running log of problems hit and how they were solved, so we don't re-debug them.

---

## 2026-10-17

### npm cache EACCES (root-owned files)
- **Symptom:** `create-next-app` / `npm install` failed with
  `EACCES ... /Users/syednahid/.npm/_cacache` (root-owned files from an old npm bug).
- **Fix (no sudo):** point npm at a local cache for the command:
  `npm_config_cache="$(pwd)/.npm-cache" npx create-next-app ...` and
  `npm_config_cache="$(pwd)/../.npm-cache" npm install ...`.
- **Permanent fix (optional, user action):** `sudo chown -R 502:20 ~/.npm`.
- **Note:** `.npm-cache/` lives at the Hackathons root; keep it out of the repo / git.

### Spike runs before credentials exist
- **Expected behavior, not a bug:** `npm run spike` throws
  `AirwallexClient requires clientId and apiKey` until `.env.local` is populated.
  This confirms the toolchain (tsx + imports + dotenv) works.

---

### Live spike results (auth + treasury + FX all PASS)
- **Auth** works: `POST /api/v1/authentication/login` → Bearer token.
- **Balances**: `GET /api/v1/balances/current` returns an **array** of
  `{currency, available_amount, total_amount, ...}`. Funded currencies in this
  sandbox: **CNY, EUR, GBP, INR, USD** — each `10000000` (minor units → 100,000.00).
- **FX rate**: `GET /api/v1/fx/rates/current` returns `rate_details` with `AWX`
  and `CLIENT` levels (this is the "saved $X" data).
- **Conversion** PASS after fixing three things (errors were descriptive):
  1. requires header **`x-api-version: 2024-04-30`** (else `incorrect_version`).
  2. requires **`reason`** (used `"other"`).
  3. requires **`term_agreement: true`**.
  Result settled instantly: returns `conversion_id`, `awx_rate`, `client_rate`,
  `mid_rate`, `status: "SETTLED"`.

### Issuing — cardholder PASS, card BLOCKED (needs enablement)
- **Cardholder** creation works with `x-api-version: 2024-01-31`:
  `{type:"INDIVIDUAL", email, mobile_number, individual:{name, date_of_birth,
  express_consent_obtained:"yes", address{city,country,line1,postcode,state}}}`.
  Returns `cardholder_id`, status **PENDING**.
  - Gotcha: `cardholder_agreement_terms_consent_obtained` must be **omitted** for
    non-CA cardholders ("Must be null for non-CA cardholder").
- **Card** creation fields learned: `card_status` is response-only (not a request
  field); `activate_on_issue` is **physical-only**; `type` is required.
- **BLOCKER:** this sandbox account's **issuing program is not configured**:
  - `type: PREPAID | DEBIT | DD_OTA` → *"Your account is not allowed to set X card
    type, reach out to support about issuing setting for your account."*
  - `type: GOOD_FUNDS_CREDIT` → passes type check but fails with
    *"Invalid issuance details"* (generic) even for an ORGANISATION card with no
    cardholder → so it's the program/BIN config, not the cardholder.
  - **Action:** Airwallex support must enable/configure the issuing program (see
    task #4). Code path is correct and will work once enabled.

### Next.js 16 `cacheComponents` vs route config
- Scaffold enabled `cacheComponents: true` (+ `partialPrefetching: true`) in
  `next.config.ts`. With it on, route handlers **cannot** export `runtime` or
  `dynamic` ("not compatible with nextConfig.cacheComponents").
- **Fix:** set `cacheComponents: false` and remove `partialPrefetching` (it requires
  cacheComponents). Our routes are dynamic by default and run on the node runtime
  (needed for `node:sqlite`). Config changes require a dev-server restart.

### FX conversion `reason` enum
- `reason: "other"` is accepted by conversions/create. (Full enum not needed yet.)

## Open items (post-enablement)
- [ ] Re-run card issuance once issuing program configured; confirm card object + PAN.
- [ ] Simulate-transaction endpoint path + payload (sandbox) → trigger a decline.
- [ ] Whether cardholder must move PENDING → ACTIVE before issuance.
- [ ] Remote Authorization availability in sandbox (pending AM enablement).
