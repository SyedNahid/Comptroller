/**
 * Minimal, typed Airwallex client for Comptroller.
 *
 * Handles authentication + token caching and exposes a generic `request`
 * method plus thin typed wrappers for the endpoints Comptroller uses.
 *
 * Auth: POST /api/v1/authentication/login with x-client-id + x-api-key headers
 * returns a Bearer token valid ~30 min — we cache and reuse it.
 *
 * Docs verified:
 *  - https://www.airwallex.com/docs/api/2024-04-30/authentication/api_access_token
 *  - https://www.airwallex.com/docs/transactional-fx/get-started/create-a-conversion
 *  - https://www.airwallex.com/docs/issuing/overview
 */

const DEFAULT_BASE_URL = "https://api.sandbox.airwallex.com";
/** Date-version required by FX conversion/quote endpoints. */
const FX_API_VERSION = "2024-04-30";
/** Date-version required by Issuing endpoints. */
const ISSUING_API_VERSION = "2024-01-31";

export interface AirwallexConfig {
  clientId: string;
  apiKey: string;
  baseUrl?: string;
}

export class AirwallexError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "AirwallexError";
  }
}

interface CachedToken {
  token: string;
  /** epoch ms when the token should be considered expired */
  expiresAt: number;
}

export class AirwallexClient {
  private readonly clientId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private cached: CachedToken | null = null;

  constructor(config: AirwallexConfig) {
    if (!config.clientId || !config.apiKey) {
      throw new Error(
        "AirwallexClient requires clientId and apiKey. Set AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY.",
      );
    }
    this.clientId = config.clientId;
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  /** Log in (or reuse a cached token) and return a valid Bearer token. */
  async getToken(): Promise<string> {
    const now = Date.now();
    // Refresh 60s before actual expiry to avoid edge-of-expiry failures.
    if (this.cached && this.cached.expiresAt - 60_000 > now) {
      return this.cached.token;
    }

    const res = await fetch(`${this.baseUrl}/api/v1/authentication/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": this.clientId,
        "x-api-key": this.apiKey,
      },
    });

    const body = await this.parseBody(res);
    if (!res.ok) {
      throw new AirwallexError(
        `Authentication failed (${res.status})`,
        res.status,
        body,
      );
    }

    const token = (body as { token?: string }).token;
    if (!token) {
      throw new AirwallexError("Login response missing token", res.status, body);
    }

    // Tokens last ~30 min; cache for 25 min to be safe regardless of clock skew.
    this.cached = { token, expiresAt: now + 25 * 60_000 };
    return token;
  }

  /** Generic authenticated request. Returns parsed JSON (typed by caller). */
  async request<T = unknown>(
    method: string,
    path: string,
    options: {
      query?: Record<string, string | number | undefined>;
      body?: unknown;
      /** Some endpoints (FX conversions/quotes) require a date version header. */
      apiVersion?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const token = await this.getToken();
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.apiVersion ? { "x-api-version": options.apiVersion } : {}),
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const body = await this.parseBody(res);
    if (!res.ok) {
      throw new AirwallexError(
        `${method} ${path} failed (${res.status})`,
        res.status,
        body,
      );
    }
    return body as T;
  }

  private async parseBody(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  // ---- Treasury: balances + FX -------------------------------------------

  getBalances() {
    return this.request("GET", "/api/v1/balances/current");
  }

  getFxRate(params: { buy_currency: string; sell_currency: string; sell_amount?: number; buy_amount?: number }) {
    return this.request("GET", "/api/v1/fx/rates/current", { query: params });
  }

  createFxQuote(body: {
    buy_currency: string;
    sell_currency: string;
    buy_amount?: string | number;
    sell_amount?: string | number;
    validity?: string; // e.g. "HR_24"
    conversion_date?: string;
  }) {
    return this.request("POST", "/api/v1/fx/quotes/create", {
      body,
      apiVersion: FX_API_VERSION,
    });
  }

  createConversion(body: {
    request_id: string; // idempotency key
    buy_currency: string;
    sell_currency: string;
    buy_amount?: string | number;
    sell_amount?: string | number;
    quote_id?: string;
    conversion_date?: string;
    reason?: string;
    term_agreement?: boolean;
  }) {
    return this.request("POST", "/api/v1/conversions/create", {
      body,
      apiVersion: FX_API_VERSION,
    });
  }

  // ---- Issuing: cardholders + cards --------------------------------------
  // NOTE: exact issuing paths/fields are confirmed during the Week-0 spike;
  // adjust here once the sandbox responses are observed.

  createCardholder(body: unknown) {
    return this.request("POST", "/api/v1/issuing/cardholders/create", {
      body,
      apiVersion: ISSUING_API_VERSION,
    });
  }

  createCard(body: unknown) {
    return this.request("POST", "/api/v1/issuing/cards/create", {
      body,
      apiVersion: ISSUING_API_VERSION,
    });
  }

  getCardTransactions(query?: Record<string, string | number | undefined>) {
    return this.request("GET", "/api/v1/issuing/transactions", {
      query,
      apiVersion: ISSUING_API_VERSION,
    });
  }
}

/** Build a client from environment variables. */
export function airwallexFromEnv(): AirwallexClient {
  return new AirwallexClient({
    clientId: process.env.AIRWALLEX_CLIENT_ID ?? "",
    apiKey: process.env.AIRWALLEX_API_KEY ?? "",
    baseUrl: process.env.AIRWALLEX_BASE_URL,
  });
}
