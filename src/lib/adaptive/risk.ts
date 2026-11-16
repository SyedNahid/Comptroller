/**
 * Behavioral risk engine — the ADAPTIVE core of Comptroller.
 *
 * Static caps answer "is THIS request within the mandate?". This engine answers
 * the question a static controller can't: "is this agent *behaving* the way it
 * normally does, or has something changed?" It scores an agent in real time from
 * its own recent ledger history and returns an explainable 0–100 score plus the
 * exact factors that drove it — so the governor (and a human) can see *why*.
 *
 * Pure function, no side effects, fully deterministic — same inputs, same score.
 * This is evidence the treasury is adaptive, not just a wall of fixed limits.
 */

import type { Decision } from "../mandate/types";

export type RiskBand = "CALM" | "ELEVATED" | "HIGH" | "CRITICAL";

/** What the governor should do about this score. */
export type GovernorAction = "NONE" | "FLAG" | "TIGHTEN" | "FREEZE";

/** One explainable contribution to the score. */
export interface RiskFactor {
  key: string;
  label: string;
  points: number;
  detail: string;
}

export interface RiskAssessment {
  score: number; // 0–100, clamped
  band: RiskBand;
  action: GovernorAction;
  factors: RiskFactor[];
  /** Human-readable one-liner summarizing the top driver. */
  summary: string;
}

/** A recent funding attempt, newest or oldest order — we sort internally. */
export interface RiskEvent {
  amountMinor: number;
  currency: string;
  merchantCategory?: string | null;
  decision: Decision;
  createdAt: string; // ISO
}

export interface RiskInput {
  now: string; // ISO
  events: RiskEvent[];
  dailyCapMinor: number;
  spentTodayMinor: number;
  /** Auto-approve threshold — enables structuring (split-to-evade) detection. */
  autoApproveThresholdMinor?: number;
  /** Velocity window in minutes (default 5). */
  windowMinutes?: number;
}

const WEIGHTS = {
  velocity: 30, // bursts of requests = probing / runaway loop
  denial: 35, // repeated mandate rejections = attacking the boundary
  amountSpike: 25, // sudden jump vs the agent's own norm
  structuring: 20, // many requests just under a limit = split-to-evade
  capProximity: 15, // draining toward the daily ceiling
  mccChurn: 15, // spraying across new merchant categories
} as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function bandFor(score: number): RiskBand {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "ELEVATED";
  return "CALM";
}

function actionFor(band: RiskBand): GovernorAction {
  switch (band) {
    case "CRITICAL":
      return "FREEZE";
    case "HIGH":
      return "TIGHTEN";
    case "ELEVATED":
      return "FLAG";
    default:
      return "NONE";
  }
}

/**
 * Score an agent's current behavior. Each factor is independent and capped, then
 * summed and clamped to 100 — so the score is bounded and every point is traceable
 * to a named factor.
 */
export function assessRisk(input: RiskInput): RiskAssessment {
  const windowMs = (input.windowMinutes ?? 5) * 60_000;
  const nowMs = Date.parse(input.now);
  const events = [...input.events].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const factors: RiskFactor[] = [];

  // --- 1. Velocity: requests inside the window ---
  const inWindow = events.filter((e) => nowMs - Date.parse(e.createdAt) <= windowMs);
  const velPoints = clamp((inWindow.length - 2) * 8, 0, WEIGHTS.velocity);
  if (velPoints > 0) {
    factors.push({
      key: "velocity",
      label: "Request velocity",
      points: velPoints,
      detail: `${inWindow.length} requests in the last ${input.windowMinutes ?? 5} min`,
    });
  }

  // --- 2. Denial rate: boundary-probing over the recent window ---
  const recent = events.slice(0, 10);
  const denied = recent.filter((e) => e.decision === "DENY").length;
  const denPoints = clamp(denied * 12, 0, WEIGHTS.denial);
  if (denPoints > 0) {
    factors.push({
      key: "denial",
      label: "Mandate rejections",
      points: denPoints,
      detail: `${denied} of the last ${recent.length} requests were DENIED`,
    });
  }

  // --- 3. Amount spike: latest vs the agent's own recent average ---
  if (events.length >= 2) {
    const latest = events[0].amountMinor;
    const prior = events.slice(1);
    const baseline =
      prior.reduce((s, e) => s + e.amountMinor, 0) / Math.max(1, prior.length);
    const ratio = baseline > 0 ? latest / baseline : 1;
    let spikePoints = 0;
    if (ratio >= 3) spikePoints = WEIGHTS.amountSpike;
    else if (ratio >= 2) spikePoints = 15;
    else if (ratio >= 1.5) spikePoints = 8;
    if (spikePoints > 0) {
      factors.push({
        key: "amountSpike",
        label: "Amount anomaly",
        points: spikePoints,
        detail: `latest request ${ratio.toFixed(1)}× the agent's recent average`,
      });
    }
  }

  // --- 3b. Structuring: several requests clustered just under the approval
  // threshold within the window — the classic "split it to sneak under the cap"
  // evasion. A static per-request cap never sees this; it only looks at one
  // request at a time. We look at the pattern.
  if (input.autoApproveThresholdMinor && input.autoApproveThresholdMinor > 0) {
    const thr = input.autoApproveThresholdMinor;
    const nearThreshold = inWindow.filter(
      (e) => e.amountMinor >= thr * 0.8 && e.amountMinor <= thr,
    ).length;
    const structPoints =
      nearThreshold >= 2 ? clamp(nearThreshold * 10, 0, WEIGHTS.structuring) : 0;
    if (structPoints > 0) {
      factors.push({
        key: "structuring",
        label: "Structuring pattern",
        points: structPoints,
        detail: `${nearThreshold} requests just under the approval threshold (possible split-to-evade)`,
      });
    }
  }

  // --- 4. Cap proximity: how close to the daily ceiling ---
  if (input.dailyCapMinor > 0) {
    const used = input.spentTodayMinor / input.dailyCapMinor;
    let capPoints = 0;
    if (used >= 0.9) capPoints = WEIGHTS.capProximity;
    else if (used >= 0.7) capPoints = 8;
    if (capPoints > 0) {
      factors.push({
        key: "capProximity",
        label: "Daily-cap proximity",
        points: capPoints,
        detail: `${Math.round(used * 100)}% of the daily cap already spent`,
      });
    }
  }

  // --- 5. Merchant-category churn inside the window ---
  const mccs = new Set(
    inWindow.map((e) => e.merchantCategory).filter((m): m is string => !!m),
  );
  const churnPoints = clamp((mccs.size - 1) * 7, 0, WEIGHTS.mccChurn);
  if (churnPoints > 0) {
    factors.push({
      key: "mccChurn",
      label: "Merchant churn",
      points: churnPoints,
      detail: `${mccs.size} distinct merchant categories in the window`,
    });
  }

  const score = clamp(
    Math.round(factors.reduce((s, f) => s + f.points, 0)),
    0,
    100,
  );
  const band = bandFor(score);
  const action = actionFor(band);
  const top = [...factors].sort((a, b) => b.points - a.points)[0];
  const summary =
    band === "CALM"
      ? "Behaving within its normal pattern."
      : `${band} — mainly ${top ? top.label.toLowerCase() : "mixed signals"}.`;

  return { score, band, action, factors, summary };
}
