// The target metrics the pipeline lets you pick from. Kept narrow on
// purpose — Aadi's call. Every idea in the pipeline is trying to move
// ONE of these; if it doesn't fit, we probably shouldn't build it.
//
// The `key` values are stable IDs that match keys in METRIC_KEYS in
// release-history.ts, so the cross-reference on other dashboards can
// still light up when an idea targets, say, perday_day1.
//
// If we ever want to add more, expand PIPELINE_METRICS here rather
// than in the pipeline page — one edit, everywhere updated.

export interface PipelineMetric {
  key: string; // stable ID (matches release-history METRIC_KEYS)
  label: string; // human-readable label shown in the picker + card chips
  description: string; // one-liner shown on hover / in the picker
}

export const PIPELINE_METRICS: PipelineMetric[] = [
  {
    key: "funnel_trial_started",
    label: "Install to Trial",
    description: "% of signups that reach + start the trial paywall.",
  },
  {
    key: "perday_day1",
    label: "Day 1 start",
    description: "% of trials that complete at least one exercise on Day 1.",
  },
  {
    key: "perday_day2",
    label: "Day 2 completion",
    description: "% of trials that come back and complete Day 2.",
  },
  {
    key: "outcome_converted",
    label: "Trial to Paid",
    description: "% of trials that convert to a paid subscription.",
  },
  {
    key: "retention_d14",
    label: "Day 14 retention",
    description:
      "% of paid users still completing routines on Day 14. Kills post-trial churn from content dead zones.",
  },
];

export function pipelineMetricLabel(key: string | null): string | null {
  if (!key) return null;
  return PIPELINE_METRICS.find((m) => m.key === key)?.label ?? key;
}
