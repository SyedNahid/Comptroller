/**
 * Ledger schema. Every decision and money movement is recorded so the demo can
 * show a complete, immutable audit trail and reconcile spend to agent+task.
 */

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  agent_id       TEXT PRIMARY KEY,
  display_name   TEXT NOT NULL,
  base_currency  TEXT NOT NULL,
  policy_json    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fund_requests (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL,
  task            TEXT NOT NULL,
  amount_minor    INTEGER NOT NULL,
  currency        TEXT NOT NULL,
  merchant_cat    TEXT,
  merchant_name   TEXT,
  decision        TEXT NOT NULL,      -- AUTO_APPROVE | NEEDS_HUMAN | DENY
  status          TEXT NOT NULL,      -- PENDING_APPROVAL | APPROVED | DENIED | FUNDED | SETTLED | CLAWED_BACK
  reason          TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  day             TEXT NOT NULL       -- YYYY-MM-DD for daily-cap aggregation
);

CREATE TABLE IF NOT EXISTS conversions (
  id               TEXT PRIMARY KEY,
  fund_request_id  TEXT,
  conversion_id    TEXT,              -- Airwallex conversion_id
  buy_currency     TEXT,
  sell_currency    TEXT,
  buy_amount_minor INTEGER,
  sell_amount_minor INTEGER,
  client_rate      REAL,
  awx_rate         REAL,
  saved_minor      INTEGER,           -- estimated saving vs a baseline
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id               TEXT PRIMARY KEY,
  fund_request_id  TEXT,
  card_id          TEXT,              -- Airwallex card_id
  currency         TEXT,
  limit_minor      INTEGER,
  merchant_cat     TEXT,
  single_use       INTEGER,
  status           TEXT,              -- ISSUED | FROZEN | CANCELLED
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS authorizations (
  id               TEXT PRIMARY KEY,
  card_id          TEXT,
  fund_request_id  TEXT,
  amount_minor     INTEGER,
  currency         TEXT,
  merchant_cat     TEXT,
  result           TEXT,              -- AUTHORIZED | DECLINED
  reason           TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clawbacks (
  id               TEXT PRIMARY KEY,
  fund_request_id  TEXT,
  card_id          TEXT,
  residual_minor   INTEGER,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ts               TEXT NOT NULL,
  agent_id         TEXT,
  fund_request_id  TEXT,
  type             TEXT NOT NULL,
  message          TEXT NOT NULL,
  data_json        TEXT
);
`;
