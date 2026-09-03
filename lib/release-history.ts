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
  date: string | null;      // ISO date shipped (yyyy-mm-dd), OR null for
                            // an in-flight version that hasn't shipped
                            // yet (used by /dashboard/pipeline to show
                            // "assigned to next release" swimlane). When
                            // the version ships, flip to the real date
                            // and the release history + cohort picker
                            // pick it up automatically.
  time?: string;            // optional UTC time (HH:mm) — use when a
                            // release needs sub-day precision (e.g. ads
                            // launched mid-day and pre-launch data is
                            // noise). Defaults to "00:00" if omitted.
  description: string;      // what changed, plain english
  tracks: string[];         // metric keys expected to move — see METRIC_KEYS
  outcome?: string;         // filled in AFTER data lands: what actually moved
  audience: "mobile" | "web"; // which cohort this release affects.
                            // Mobile dashboards (trial, onboarding) filter
                            // to "mobile" so a web-only launch (e.g. ads
                            // going live) doesn't silently become the
                            // default cutoff for mobile pages.
}

// Ordered newest first. Mobile pages (trial, onboarding) filter to
// audience==="mobile"; the web pages (trial-web, onboarding-web) filter
// to "web". If you add a backend integration (webhook, cron, etc.) it
// probably doesn't shift any user-visible cohort — don't add an entry.
export const RELEASES: Release[] = [
  {
    // In-flight placeholder — next mobile release.
    slug: "5_19_next",
    label: "5.19 (in flight)",
    date: null,
    description: "In flight — assign ideas via /dashboard/pipeline.",
    tracks: [],
    audience: "mobile",
  },
  // "All time" pseudo-release — picker option to unfilter to the full
  // dataset. Date is arbitrary early cutoff (before the app existed);
  // treated as any other release by consumers so no special-casing
  // needed downstream.
  {
    slug: "all_time_mobile",
    label: "All time",
    date: "2020-01-01",
    description: "No release filter — every mobile user since launch.",
    tracks: [],
    audience: "mobile",
  },
  {
    slug: "all_time_web",
    label: "All time",
    date: "2020-01-01",
    description: "No release filter — every web signup since launch.",
    tracks: [],
    audience: "web",
  },
  {
    slug: "5_18",
    label: "5.18 launch",
    date: "2026-09-03",
    time: "20:00", // 4pm EDT
    description:
      "Post-purchase Day-0 scalp baseline + Day-3/6/13 check-ins, " +
      "\"4 Questions I Get After Day 1\" video as 4th Day-1 task with " +
      "speed control, zero-flash onboarding→first-session handoff, " +
      "session CTA auto-advance, scalp check-in crash fix, streak-page " +
      "CTA says Continue on days with follow-up content.",
    tracks: [
      "funnel_started",
      "funnel_day_gte_1",
      "outcome_converted",
      "retention_d14",
    ],
    audience: "mobile",
  },
  {
    slug: "web_ads_launch",
    label: "Web ads launched",
    date: "2026-08-26",
    time: "20:15", // 4:15pm EDT
    description:
      "First day of paid Meta ads driving traffic to /start. " +
      "Every prior cohort is either mobile-only trials or test data.",
    tracks: [
      "funnel_started",
      "funnel_day_gte_1",
      "outcome_converted",
    ],
    audience: "web",
  },
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
    audience: "mobile",
  },
];

// Audience-scoped views. Consumers should import these directly instead
// of filtering RELEASES at the call site — a web release must never
// become the default cutoff for a mobile page.
//
// Shipped-only variants exclude in-flight (date === null) releases so
// the cohort picker on dashboards doesn't offer a version that has no
// window. The pipeline page uses the full audience list so it can
// render "next release" ideas.
export const MOBILE_RELEASES: Release[] = RELEASES.filter(
  (r) => r.audience === "mobile" && r.date !== null,
);
export const WEB_RELEASES: Release[] = RELEASES.filter(
  (r) => r.audience === "web" && r.date !== null,
);
export const MOBILE_RELEASES_INC_INFLIGHT: Release[] = RELEASES.filter(
  (r) => r.audience === "mobile",
);
export const WEB_RELEASES_INC_INFLIGHT: Release[] = RELEASES.filter(
  (r) => r.audience === "web",
);

/**
 * The next in-flight release for a given audience (the one whose
 * ideas are currently being built). Returns null if there's no
 * unshipped version registered — that's a hint to add a `date: null`
 * entry to RELEASES.
 */
export function getInFlightRelease(
  audience: "mobile" | "web",
): Release | null {
  return (
    RELEASES.find((r) => r.audience === audience && r.date === null) ?? null
  );
}

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
  retention: {
    // Day-N retention milestones — % of the paid cohort that had
    // ≥1 completed exercise on the given day. Computed by
    // /api/dashboard/retention and rendered on /dashboard/retention.
    retention_d1: "Day 1 retention",
    retention_d7: "Day 7 retention",
    retention_d14: "Day 14 retention",
    retention_d30: "Day 30 retention",
    retention_d60: "Day 60 retention",
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────────
//
// All list-walking helpers take an optional `list` parameter so mobile
// pages can pass MOBILE_RELEASES and web pages can pass WEB_RELEASES.
// Without this, getReleaseWindow("162_launch") on a mobile page would
// end its window at the next release IN THE UNIFIED LIST — which could
// be a WEB release (web_ads_launch) — and cut mobile data off at the
// web ads launch time. The window must be scoped to the same audience.

/** Get a release by slug. Searches the unified list — slugs are unique. */
export function getRelease(slug: string | null | undefined): Release | null {
  if (!slug) return null;
  return RELEASES.find((r) => r.slug === slug) ?? null;
}

/**
 * Given a "new" release slug, return the release immediately before it
 * (chronologically) within the same audience list. Used as the
 * auto-default baseline for cohort comparison.
 */
export function getPreviousRelease(
  slug: string,
  list: Release[] = RELEASES,
): Release | null {
  const idx = list.findIndex((r) => r.slug === slug);
  if (idx < 0 || idx >= list.length - 1) return null;
  return list[idx + 1];
}

/**
 * Date range covered by a release: from its ship date up to (but not
 * including) the next release's ship date in the SAME audience list,
 * or now if it's the newest for that audience.
 */
export function getReleaseWindow(
  slug: string,
  list: Release[] = RELEASES,
): { from: Date; to: Date } | null {
  const idx = list.findIndex((r) => r.slug === slug);
  if (idx < 0) return null;
  const r = list[idx];
  // In-flight (date: null) releases have no window yet — no cohort
  // data to compare against. Callers should filter these out before
  // calling.
  if (r.date === null) return null;
  const startOf = (rr: Release): Date =>
    new Date(`${rr.date}T${rr.time ?? "00:00"}:00Z`);
  const from = startOf(r);
  // Walk backwards through the list to find the NEWER shipped release
  // (skipping any in-flight entries that sit above).
  let to: Date = new Date();
  for (let i = idx - 1; i >= 0; i--) {
    if (list[i].date !== null) {
      to = startOf(list[i]);
      break;
    }
  }
  return { from, to };
}
