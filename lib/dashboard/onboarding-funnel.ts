/**
 * Onboarding funnel stages, shared by the web Onboarding page and the
 * founder app so both count the same way. Pure.
 */
// ── Funnel stages ────────────────────────────────────
// Each stage checks a Firestore field that gets written *when the
// user completes that specific step*. Reaching a later stage
// implies the user passed every earlier stage (the flow is linear),
// so we can infer drop-off between the intermediate screens too even
// when they don't write their own field.
//
// Ordered by flow position. `check` returns true if the user reached
// that stage. All users count toward "Signed up" — the 100% baseline.
export interface FunnelStage {
  key: string;
  label: string;
  check: (d: Record<string, unknown>) => boolean;
}

// Only users on the +162 build write these event fields. Presence of
// `founder_story_started_at` is the earliest new-build signal, so we
// treat it as the funnel cohort marker. Every stage % is measured
// within THAT cohort — otherwise the baseline is polluted by 90k
// legacy users who never had the writes and the funnel reads as 0%
// everywhere.
export const IS_NEW_BUILD_USER = (d: Record<string, unknown>) =>
  !!d.founder_story_started_at;

export const FUNNEL_STAGES: FunnelStage[] = [
  // Baseline for the new-build cohort. 100% by definition — every
  // user in this funnel got past the founder story mount.
  { key: "founder_started",   label: "Founder story started",  check: (d) => !!d.founder_story_started_at },
  { key: "pinch_started",     label: "Pinch test started",     check: (d) => !!d.pinch_test_started_at },
  { key: "results_started",   label: "Results screenshots started", check: (d) => !!d.results_screenshots_started_at },
  // Quiz's own field (hair_loss_location) exists on legacy accounts
  // too, so we AND it with the new-build marker to keep the funnel
  // internally consistent (no user shows up here without also having
  // reached the earlier stages).
  { key: "quiz_started",      label: "Quiz started",           check: (d) => !!d.hair_loss_location && !!d.founder_story_started_at },
  { key: "paywall_viewed",    label: "Paywall viewed",         check: (d) => !!d.paywall_viewed_at },
  { key: "trial_started",     label: "Trial started",          check: (d) => !!d.started_trial },
];


/** Fields the stages read (pass to .select()). */
export const FUNNEL_FIELDS = [
  "founder_story_started_at",
  "pinch_test_started_at",
  "results_screenshots_started_at",
  "hair_loss_location",
  "paywall_viewed_at",
  "started_trial",
] as const;
