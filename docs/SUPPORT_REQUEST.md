# Airwallex support request — issuing enablement (copy/paste)

**Send to: devhelp@airwallex.com** (official hackathon enablement channel per the
Builder Guide). Send **from your sandbox-registered email** and include your Client ID
so they can locate the account. Fill the two placeholders below.

---

**Subject:** Sandbox issuing enablement for Agentic Banking Hackathon — card issuance + remote authorization

Hi team,

I'm building a project for the Airwallex Agentic Banking Hackathon (track: Adaptive
Treasury Controller) on the **sandbox**. Auth, balances, FX quotes and conversions
are all working. I'm blocked on **Card Issuing** — it looks like the issuing program
isn't configured on my sandbox account.

**Account details**
- Sandbox account email: `<YOUR_SANDBOX_LOGIN_EMAIL>`
- Client ID: `<YOUR_SANDBOX_CLIENT_ID>`  (API key withheld)

**What I see** calling `POST /api/v1/issuing/cards/create` (x-api-version 2024-01-31):
- `type: "PREPAID"` → *"Your account is not allowed to set 'PREPAID' card type, please reach out to our support team about issuing setting for your account."*
- `type: "DEBIT"` → same message for DEBIT.
- `type: "DD_OTA"` → same message for DD_OTA.
- `type: "GOOD_FUNDS_CREDIT"` → passes type validation but returns `invalid_request` / *"Invalid issuance details"* (also fails for an ORGANISATION card with no cardholder, so it isn't the cardholder).

Cardholder creation works fine (returns a `cardholder_id`, status PENDING).

**Requests:**
1. Please **enable/configure the issuing program** on my sandbox account so I can
   issue **virtual cards** (which card `type` should I use, and is any program/BIN
   setup needed on my side?).
2. Please also **enable Remote Authorization** so I can approve/decline card
   authorizations in real time via webhook (I'll configure the HTTPS endpoint).

Thanks very much — happy to share any more detail.

---

## Notes
- Remote Authorization + issuing program both require Account-Manager action per docs.
- Our demo has a fallback that doesn't need Remote Authorization (native spend-control
  declines), but it **does** need issuing itself enabled (request #1 above) — so #1 is
  the critical-path item.
