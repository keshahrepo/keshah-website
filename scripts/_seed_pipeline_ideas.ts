// One-shot seed of the Firestore `Ideas` collection from the 14
// proposals I've been writing to ACTIVATION_PROPOSALS.md. After this
// runs, /dashboard/pipeline is the source of truth; the markdown
// file gets archived.
//
// Idempotent — re-running upserts the same 14 docs by ID (p1..p14),
// which means minor edits to titles/eli5s here can be re-applied.
// BUT: any manual status change / description edit made via the
// pipeline UI will be OVERWRITTEN if you re-run this. Don't re-run
// after Aadi has started editing. Rename to "_seed_pipeline_ideas_v2"
// or add a --skip-if-exists flag before the next big migration.
//
// Usage: npx tsx scripts/_seed_pipeline_ideas.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

interface SeedIdea {
  id: string;
  title: string;
  eli5: string;
  status: "bank" | "assigned" | "building" | "shipped" | "parked";
  target_metric: string | null;
  assigned_version: string | null;
  ship_cluster: string;
  dependencies: string[]; // idea IDs like "p3"
  original_proposal_number: number;
  parked_reason?: string;
  parked_unpark_trigger?: string;
}

const IDEAS: SeedIdea[] = [
  {
    id: "p1",
    title: "Auto-launch first session; move photos after",
    eli5:
      "Stop making people take three photos right after they pay. Let them do a routine first, feel the win, then ask for photos.",
    status: "building",
    target_metric: "perday_day1",
    assigned_version: "5_18_next",
    ship_cluster: "Day 1 activation",
    dependencies: [],
    original_proposal_number: 1,
  },
  {
    id: "p2",
    title: "Sendblue iMessage nudge opt-in",
    eli5:
      "One-tap opt-in to daily texts from Aadi via Sendblue. iMessage opens at 90%+ vs push at 20-40% — daily reminders fire as texts instead of notifications.",
    status: "bank",
    target_metric: "funnel_day_gte_1",
    assigned_version: null,
    ship_cluster: "Habit loop",
    dependencies: [],
    original_proposal_number: 2,
  },
  {
    id: "p3",
    title: "Elevate check-ins from admin pill to milestone",
    eli5:
      "The Day 3 / Day 6 check-in is a slim pill today. Redesign as a hero moment with lead-up anticipation + a hero-treatment modal on the trigger day.",
    status: "bank",
    target_metric: "perday_day3",
    assigned_version: null,
    ship_cluster: "Check-in narrative",
    dependencies: [],
    original_proposal_number: 3,
  },
  {
    id: "p4",
    title: "Journey label on home screen (Day X of N)",
    eli5:
      "Always-visible small label at the top of home: 'Day 3 of 7 · Loosening your scalp'. Denominator makes it feel like a bounded challenge, not a step into infinity.",
    status: "bank",
    target_metric: "outcome_cancelled",
    assigned_version: null,
    ship_cluster: "Progress orientation",
    dependencies: ["p3"],
    original_proposal_number: 4,
  },
  {
    id: "p5",
    title: "Day 30 + Day 60 hair-fall check-ins",
    eli5:
      "We ask about scalp looseness but never about actual hair fall. Add 'less shedding?' at D30 and 'stopped?' at D60. Answers route to celebrate / coach / offer regrowth.",
    status: "bank",
    target_metric: "outcome_converted",
    assigned_version: null,
    ship_cluster: "Check-in narrative",
    dependencies: ["p3"],
    original_proposal_number: 5,
  },
  {
    id: "p6",
    title: "Stretch technique unlock timeline · fix 'UNLOCKS TOMORROW' lie",
    eli5:
      "5 of 7 techniques unlock by Day 3 today, then a 12-day dead zone. Streak page also falsely says 'UNLOCKS TOMORROW' when it's 12 days out. Stretch the schedule + fix the lie.",
    status: "bank",
    target_metric: "outcome_cancelled",
    assigned_version: null,
    ship_cluster: "Content pacing",
    dependencies: [],
    original_proposal_number: 6,
  },
  {
    id: "p7",
    title: "Mobile app writes install_source direct to Firestore",
    eli5:
      "Today Appstack pushes attribution to RevenueCat, then a daily cron mirrors it into Firestore. Mobile app now writes it directly at signup — real-time slicing instead of 24h delayed.",
    status: "shipped",
    target_metric: "funnel_started",
    assigned_version: "162_launch",
    ship_cluster: "Attribution infrastructure",
    dependencies: [],
    original_proposal_number: 7,
  },
  {
    id: "p8",
    title: "1-10 scalp-tension meter (replaces yes/no/not-sure)",
    eli5:
      "Slider anchored to a physical press-and-move test with a demo video. Baseline captured Day 0, re-rated Day 3/6. The app owns the verdict ('8 → 6, it's loosening').",
    status: "building",
    target_metric: "outcome_converted",
    assigned_version: "5_18_next",
    ship_cluster: "Check-in narrative",
    dependencies: ["p3"],
    original_proposal_number: 8,
  },
  {
    id: "p9",
    title: "End-of-Day-1 celebration + alarm setup moves here",
    eli5:
      "After they finish Day 1's routine, fire a 'Day 1 of 7 done, come back tomorrow' hero screen. The alarm ask moves to this peak-dopamine slot.",
    status: "bank",
    target_metric: "perday_day2",
    assigned_version: null,
    ship_cluster: "Day 1 activation",
    dependencies: ["p1", "p4"],
    original_proposal_number: 9,
  },
  {
    id: "p10",
    title: "4-stage journey visual + Week/copy audit",
    eli5:
      "Stage rail at top of home: Loosen → Blood flow → Stop the loss → Regrow. Trial = Stage 1. Also kills every 'Week 1 / Week 2' reference in-app.",
    status: "bank",
    target_metric: "outcome_cancelled",
    assigned_version: null,
    ship_cluster: "Progress orientation",
    dependencies: ["p4", "p5", "p8"],
    original_proposal_number: 10,
  },
  {
    id: "p11",
    title: "Catch silent notification-permission denials",
    eli5:
      "If user denies iOS notification permission in the reminder step, we schedule pushes that iOS silently drops. Catch the Deny and surface a dashboard strip to fix it.",
    status: "bank",
    target_metric: "perday_day2",
    assigned_version: null,
    ship_cluster: "Habit loop",
    dependencies: [],
    original_proposal_number: 11,
  },
  {
    id: "p12",
    title: "Daily Aadi video series during the trial",
    eli5:
      "One short Aadi video pinned to the top of the dashboard on each day of the trial. Not marketing — a personal check-in that meets the user where they are on that day.",
    status: "bank",
    target_metric: "outcome_converted",
    assigned_version: null,
    ship_cluster: "Habit loop",
    dependencies: [],
    original_proposal_number: 12,
  },
  {
    id: "p13",
    title: "Push reminders for incomplete routines",
    eli5:
      "If a user hasn't finished today's routine by a few hours after their reminder time, send a follow-up push. Streak-gated copy.",
    status: "shipped",
    target_metric: "perday_day2",
    assigned_version: "5_18_next",
    ship_cluster: "Habit loop",
    dependencies: ["p11"],
    original_proposal_number: 13,
  },
  {
    id: "p14",
    title: "7-day streak unlockable",
    eli5:
      "Show up every day for the full 7-day trial → unlock a gift. Digital-first (Aadi technique video + personalized 60-day PDF + 20% off regrowth kit). Vitamin sample as Tier-1 post-conversion later.",
    status: "bank",
    target_metric: "funnel_day_all",
    assigned_version: null,
    ship_cluster: "Habit loop",
    dependencies: ["p12"],
    original_proposal_number: 14,
  },
];

const PARKED: SeedIdea[] = [
  {
    id: "parked_trial_extension",
    title: "Trial extension for un-loosened users",
    eli5:
      "Users whose Day 6 delta is ≤ 0 get +7 free days before charging. Apple won't extend a live trial via StoreKit — needs promo entitlements + refund handling.",
    status: "parked",
    target_metric: null,
    assigned_version: null,
    ship_cluster: "Parked",
    dependencies: ["p8"],
    original_proposal_number: 100,
    parked_reason:
      "Apple won't extend a live free trial via StoreKit. Requires promotional entitlements + refund window handling. Fiddly enough to defer until we know how many users would benefit.",
    parked_unpark_trigger:
      "Once P8 has been live 30d+ AND the 'no-shift' Day 6 cohort is >15% of trials AND those users cancel at high rates.",
  },
  {
    id: "parked_tier2_pricing",
    title: "Tier 2 localized pricing",
    eli5:
      "Cheaper subscription tiers for markets outside the 22 Tier 1 countries. Real gap (Tier 2 converts ~2x worse), but engagement is the first-order fix.",
    status: "parked",
    target_metric: null,
    assigned_version: null,
    ship_cluster: "Parked",
    dependencies: [],
    original_proposal_number: 101,
    parked_reason:
      "Engagement problem first, price problem second. Most Tier 2 trials quit before pricing is the deciding factor. Fixing engagement lifts Tier 2 more than Tier 1.",
    parked_unpark_trigger:
      "After P1-4 + P8-10 ship and Tier 2 trial→paid is still <⅔ of Tier 1.",
  },
];

async function main() {
  const all = [...IDEAS, ...PARKED];
  console.log(`Seeding ${all.length} ideas into Firestore Ideas collection…`);

  const batch = db.batch();
  for (const i of all) {
    const ref = db.collection("Ideas").doc(i.id);
    batch.set(
      ref,
      {
        title: i.title,
        eli5: i.eli5,
        // Description is empty for now — old proposals live in markdown
        // still. The pipeline page will show the eli5 and let Aadi
        // click into a doc that pulls from the markdown archive if
        // he wants the full spec. Post-migration, description is
        // where the long-form goes.
        description: "",
        status: i.status,
        target_metric: i.target_metric,
        assigned_version: i.assigned_version,
        shipped_at: i.status === "shipped" ? FieldValue.serverTimestamp() : null,
        actual_delta_pp: null,
        original_proposal_number: i.original_proposal_number,
        parked_reason: i.parked_reason ?? null,
        parked_unpark_trigger: i.parked_unpark_trigger ?? null,
        ship_cluster: i.ship_cluster,
        dependencies: i.dependencies,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`✔ Seeded ${all.length} ideas.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
