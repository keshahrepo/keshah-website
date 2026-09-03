// Pipeline data model shared by /dashboard/pipeline server + client
// components + the scripts that populate the Ideas collection.
//
// One doc per idea in Firestore `Ideas` collection. Status transitions
// through the kanban columns; every idea past the "bank" column MUST
// have a target_metric picked from the METRIC_KEYS enum in
// release-history.ts so we can cross-reference impact on the metric
// dashboards later.

export type IdeaStatus =
  | "bank" // captured but not yet assigned to a version
  | "assigned" // assigned to the in-flight version's release plan
  | "building" // actively being built
  | "shipped" // shipped in a release (assigned_version populated)
  | "parked"; // consciously deferred; see parked_reason

export interface IdeaDoc {
  // Firestore doc ID — stable, short (matches "p1", "p2" for legacy
  // proposals migrated from the markdown file, or auto-generated for
  // new ones).
  id: string;

  // Short display title. First line of the old proposal `## Proposal N — Title`.
  title: string;

  // 1-2 sentence eli5. Corresponds to the **ELI5:** block in the
  // markdown proposals. Shown on cards.
  eli5: string;

  // Full long-form content (markdown). Only shown in the side panel
  // when a card is opened. Everything from the old proposal's Goal
  // / Idea / Why / Implementation / Files sections concatenated.
  description: string;

  // Current pipeline position.
  status: IdeaStatus;

  // ONE metric this idea is trying to move — MUST be a key from
  // METRIC_KEYS in release-history.ts. Enforced at edit time so no
  // idea graduates from the bank without a target.
  target_metric: string | null;

  // Release slug this idea is/was assigned to (from release-history.ts).
  // Null until assigned. Frozen at ship time so we can measure delta.
  assigned_version: string | null;

  // When status was flipped to "shipped".
  shipped_at: FirebaseFirestore.Timestamp | null;

  // Post-ship measurement: percentage-point delta observed on the
  // target_metric in the shipped release's cohort vs the previous
  // release's cohort. Populated by hand or by a later cron job.
  actual_delta_pp: number | null;

  // Original ordinal in the markdown file, used only for the
  // initial import — after that, doc IDs are stable and this field
  // is informational.
  original_proposal_number: number | null;

  // Parked ideas carry a why + what-would-unpark-it note.
  parked_reason: string | null;
  parked_unpark_trigger: string | null;

  // Optional grouping so we can render "ship-cluster" hints on cards.
  // Free-form (matches the "ship-cluster" section names I used in
  // the markdown roadmap: "Day 1 activation", "Habit loop", etc.).
  ship_cluster: string | null;

  // Dependencies on other ideas — array of idea IDs. Empty for
  // standalone. Used for the dep chips on cards.
  dependencies: string[];

  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}

// Client-facing serialized version of IdeaDoc — timestamps → ISO
// strings so we can pass it from server components to client
// components without JSON serialization complaints.
export interface Idea {
  id: string;
  title: string;
  eli5: string;
  description: string;
  status: IdeaStatus;
  target_metric: string | null;
  assigned_version: string | null;
  shipped_at: string | null;
  actual_delta_pp: number | null;
  original_proposal_number: number | null;
  parked_reason: string | null;
  parked_unpark_trigger: string | null;
  ship_cluster: string | null;
  dependencies: string[];
  created_at: string;
  updated_at: string;
}

export function docToIdea(id: string, d: Partial<IdeaDoc>): Idea {
  const toIso = (t: unknown): string | null => {
    if (!t) return null;
    if (typeof t === "string") return t;
    if (typeof t === "object" && t !== null && "toDate" in t) {
      return (t as { toDate: () => Date }).toDate().toISOString();
    }
    return null;
  };
  return {
    id,
    title: d.title ?? "",
    eli5: d.eli5 ?? "",
    description: d.description ?? "",
    status: (d.status as IdeaStatus) ?? "bank",
    target_metric: d.target_metric ?? null,
    assigned_version: d.assigned_version ?? null,
    shipped_at: toIso(d.shipped_at),
    actual_delta_pp:
      typeof d.actual_delta_pp === "number" ? d.actual_delta_pp : null,
    original_proposal_number:
      typeof d.original_proposal_number === "number"
        ? d.original_proposal_number
        : null,
    parked_reason: d.parked_reason ?? null,
    parked_unpark_trigger: d.parked_unpark_trigger ?? null,
    ship_cluster: d.ship_cluster ?? null,
    dependencies: d.dependencies ?? [],
    created_at: toIso(d.created_at) ?? new Date(0).toISOString(),
    updated_at: toIso(d.updated_at) ?? new Date(0).toISOString(),
  };
}

// Column definitions for the kanban rendering. Order left-to-right =
// the pipeline flow: capture → prioritize → execute → measure →
// (dead-end) parked.
export const KANBAN_COLUMNS: Array<{
  id: IdeaStatus;
  label: string;
  hint: string;
}> = [
  {
    id: "bank",
    label: "Ideas bank",
    hint: "Captured but not yet assigned to a version.",
  },
  {
    id: "assigned",
    label: "Next release",
    hint: "Assigned to the in-flight version. Needs target metric.",
  },
  {
    id: "building",
    label: "Building",
    hint: "In active development.",
  },
  {
    id: "shipped",
    // Display label is "Done" — Aadi's call. The status ID stays
    // "shipped" for stable Firestore data. Some ideas are "done"
    // without a release (research sprints, admin toggles); "Done"
    // covers both cases more accurately than "Shipped."
    label: "Done",
    hint: "Complete. Live in a release, or a delivered research/admin task.",
  },
  {
    id: "parked",
    label: "Parked",
    hint: "Consciously deferred. Unpark trigger listed on card.",
  },
];
