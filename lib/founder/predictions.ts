/**
 * "How good are my picks?": before a creator's first posting day the founder
 * says how likely they are to pass the 20-day trial (one tap). It locks once
 * they start. After the trial we compare the guess with what happened.
 *
 *   ContentCreators/{id}.hire_prediction  { pct, why?, at }
 */
export const PREDICTION_PCTS = [20, 40, 60, 80, 95] as const;
export type PredictionPct = (typeof PREDICTION_PCTS)[number];

export interface HirePrediction {
  pct: PredictionPct;
  why?: string;
  at: string;
}

export function parsePrediction(raw: unknown, nowIso: string): HirePrediction | { error: string } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pct = Number(b.pct);
  if (!(PREDICTION_PCTS as readonly number[]).includes(pct)) return { error: "Pick 20, 40, 60, 80 or 95%." };
  const why = String(b.why ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return { pct: pct as PredictionPct, ...(why ? { why } : {}), at: nowIso };
}

export type TrialResult = "not_started" | "in_trial" | "passed" | "not_passed";

/** Where their trial ended up: kept after the trial = passed; ended = not passed. */
export function trialResult(c: { start_date?: unknown; trial_outcome?: unknown; status?: unknown }): TrialResult {
  if (c.trial_outcome === "keep") return "passed";
  if (c.trial_outcome === "end") return "not_passed";
  if (!c.start_date) return c.status === "ended" ? "not_passed" : "not_started";
  return c.status === "ended" ? "not_passed" : "in_trial";
}

/** Hit rate per confidence level, over decided trials only. */
export function calibration(rows: { pct: number; result: TrialResult }[]): { pct: number; decided: number; passed: number; waiting: number }[] {
  return PREDICTION_PCTS.map((pct) => {
    const mine = rows.filter((r) => r.pct === pct);
    const decided = mine.filter((r) => r.result === "passed" || r.result === "not_passed");
    return { pct, decided: decided.length, passed: decided.filter((r) => r.result === "passed").length, waiting: mine.length - decided.length };
  });
}
