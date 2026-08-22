// Release history — one entry per shipped update. Every admin dashboard
// page that supports cohort comparison uses this list for its preset
// chips + hypothesis banner + tracked-metric highlights.
//
// When you ship a release:
//   1. Add a new entry at the top of RELEASES with today's date
//   2. Describe what changed (one sentence, plain english)
//   3. List the metric keys you expect to move in `tracks` (see METRIC_KEYS
//      below for the valid slugs used by each page's rows)
//   4. Leave `outcome` empty — fill it in a week later once data is in

export interface Release {
  slug: string;             // stable id, used in URL params
  label: string;            // shown in chip / dropdown
  date: string;             // ISO date shipped (yyyy-mm-dd)
  description: string;      // what changed, plain english
  tracks: string[];         // metric keys expected to move — see METRIC_KEYS
  outcome?: string;         // filled in AFTER data lands: what actually moved
}

// Only real MOBILE APP releases go here — things that change what users
// see. Backend integrations (Sendblue webhook, RC webhook auth fix, etc.)
// don't get their own entry because they don't shift the in-app cohort.
//
// Ordered newest first. Trial page ALWAYS treats +162 as baseline (the
// first build with the new-onboarding data model). Future builds become
// selectable in the "new" dropdown as we ship them.
export const RELEASES: Release[] = [
  {
    slug: "162_launch",
    label: "+162 launch",
    date: "2026-08-18",
    description:
      "New onboarding flow, started_trial + converted_trial fields, " +
      "age_range question, country_tier for tier-1 gating.",
    tracks: [
      "funnel_started",
      "funnel_day_gte_1",
      "outcome_converted",
    ],
  },
];

// ── Metric direction map ─────────────────────────────────────────────
// "higher_better" — new > baseline is a WIN (highlight green)
// "lower_better"  — new < baseline is a WIN (highlight green)
// Absence from this map defaults to "higher_better".
export const METRIC_DIRECTIONS: Record<string, "higher_better" | "lower_better"> = {
  outcome_cancelled: "lower_better",
};

// ── All valid metric keys used across dashboard pages ───────────────
// Keeping them here makes typos in a release's `tracks` array easy to
// spot (you can grep and know which page renders which key).
export const METRIC_KEYS = {
  trial: {
    // Outcomes strip
    outcome_converted: "Converted to paid",
    outcome_cancelled: "Cancelled trial",
    outcome_still_in_trial: "Still in trial",
    // Funnel rows
    funnel_started: "Trial started",
    funnel_day_gte_1: "Did ≥ 1 day",
    funnel_day_gte_3: "Did ≥ 3 days",
    funnel_day_gte_5: "Did ≥ 5 days",
    funnel_day_all: "Did all 7 days",
    funnel_converted: "Converted to paid",
    // Per-day
    perday_day1: "Day 1 completion",
    perday_day2: "Day 2 completion",
    perday_day3: "Day 3 completion",
    perday_day4: "Day 4 completion",
    perday_day5: "Day 5 completion",
    perday_day6: "Day 6 completion",
    perday_day7: "Day 7 completion",
  },
  onboarding: {
    funnel_founder_started: "Founder story started",
    funnel_pinch_started: "Pinch test started",
    funnel_results_started: "Results screenshots started",
    funnel_quiz_started: "Quiz started",
    funnel_paywall_viewed: "Paywall viewed",
    funnel_trial_started: "Trial started",
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────────

/** Get a release by slug. */
export function getRelease(slug: string | null | undefined): Release | null {
  if (!slug) return null;
  return RELEASES.find((r) => r.slug === slug) ?? null;
}

/**
 * Given a "new" release slug, return the release immediately before it
 * (chronologically). Used as the auto-default baseline.
 */
export function getPreviousRelease(slug: string): Release | null {
  const idx = RELEASES.findIndex((r) => r.slug === slug);
  if (idx < 0 || idx >= RELEASES.length - 1) return null;
  return RELEASES[idx + 1];
}

/**
 * Date range covered by a release: from its ship date up to (but not
 * including) the next release's ship date, or now if it's the newest.
 */
export function getReleaseWindow(slug: string): { from: Date; to: Date } | null {
  const idx = RELEASES.findIndex((r) => r.slug === slug);
  if (idx < 0) return null;
  const from = new Date(RELEASES[idx].date + "T00:00:00Z");
  const to = idx === 0 ? new Date() : new Date(RELEASES[idx - 1].date + "T00:00:00Z");
  return { from, to };
}
