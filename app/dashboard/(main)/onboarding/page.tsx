// Quiz responses analytics — every user-facing quiz question with a
// side-by-side breakdown of All users vs Trial-starters, plus a delta
// chip so the "sticks out" answers are scannable.
//
// Cohort split: users are trial-starters iff `started_trial` is set
// (new dedicated field written by the mobile paywalls + RC webhook —
// see AppConsts.startedTrialFieldName). No backfill — the split is
// empty at launch and populates going forward.
//
// TOP SIGNALS panel at the top surfaces the 10 biggest absolute deltas
// across all questions in one view so you don't have to scroll every
// card to find the interesting differences.

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// Match testXXX@test.com accounts (any digits). Used to strip Aadi's
// QA users from the analytics so real conversion rates aren't
// polluted by testing traffic. Case-insensitive to be safe.
const TEST_EMAIL_REGEX = /^test\d+@test\.com$/i;
const isTestEmail = (email: unknown): boolean =>
  typeof email === "string" && TEST_EMAIL_REGEX.test(email);

// +162 shipped on 2026-08-18 (release with new funnel writes,
// started_trial, country_tier, age question). Scoping the Firestore
// query to users created after this cutoff:
//   1. Makes every tab/card count meaningful — no more 90k legacy
//      users diluting the numerator/denominator.
//   2. Trims the query from ~91k docs to a few hundred → faster load.
//
// Change this date when you cut a new release cohort you want to
// track separately.
const RELEASE_CUTOFF = new Date("2026-08-18T00:00:00Z");

export const dynamic = "force-dynamic";

// ── Question catalog ─────────────────────────────────────────────
interface Question {
  key: string;
  field: string;
  label: string;
  section: string;
  array?: boolean;
  // "male" → hide the card on the Women tab, "female" → hide on Men.
  // Undefined = shown on all tabs. Used to keep the page scannable
  // instead of showing empty women-only cards to men's view.
  gender?: "male" | "female";
  options: Array<{ value: string; label: string }>;
}

// Ordered to match the actual pageMap insertion order in
// post_auth_flow_2.dart — that's the runtime flow order users actually
// experience. Section labels are visual dividers only, aligned to the
// same order.
const QUESTIONS: Question[] = [
  // ── Basics (asked immediately after signup, before founder story) ──
  {
    key: "gender",
    field: "selected_gender",
    label: "I am...",
    section: "Basics",
    options: [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" },
    ],
  },
  // Age question card removed — the field is being written on new
  // signups but the card wasn't showing meaningful data yet at review
  // time. Add back later once we want the age slice.
  {
    key: "referral_source",
    field: "referral_source",
    label: "How did you hear about us?",
    section: "Basics",
    options: [
      { value: "healthcare_professional", label: "Healthcare professional" },
      { value: "founder_aadi", label: "Aadi (founder)" },
      { value: "educator_jennifer", label: "Jennifer" },
      { value: "educator_donna", label: "Donna" },
      { value: "friend_or_family", label: "Friend or family" },
      { value: "other", label: "Other" },
    ],
  },

  // ── Pinch test (after founder story + moments) ─────────────
  {
    key: "pinch_test",
    field: "pinch_test_answer",
    label: "Pinch top vs sides — which felt tighter?",
    section: "Pinch test",
    options: [
      { value: "muchTighter", label: "Much tighter where losing hair" },
      { value: "tighter", label: "Tighter where losing hair" },
      { value: "aBitTighter", label: "A bit tighter where losing hair" },
      { value: "aboutSame", label: "It's the same" },
    ],
  },

  // ── Diagnostic quiz (universal + women-only interleaved) ───
  {
    key: "hair_loss_location",
    field: "hair_loss_location",
    label: "Where are you losing hair?",
    section: "Diagnostic",
    options: [
      { value: "crown", label: "Crown (men)" },
      { value: "hairline", label: "Hairline / temples" },
      { value: "all_over", label: "All over" },
      { value: "part", label: "Part is widening (women)" },
    ],
  },
  {
    key: "hair_loss_timing",
    field: "hair_loss_timing",
    label: "When did you first notice changes? (women)",
    section: "Diagnostic",
    gender: "female",
    options: [
      { value: "Over a year ago", label: "Over a year ago" },
      { value: "Over the past year", label: "Over the past year" },
      { value: "Over the past few months", label: "Over the past few months" },
      { value: "I'm not sure", label: "I'm not sure" },
    ],
  },
  {
    key: "hair_loss_rate",
    field: "hair_loss_rate",
    label: "How quickly did these changes happen? (women)",
    section: "Diagnostic",
    gender: "female",
    options: [
      { value: "Suddenly", label: "Suddenly" },
      { value: "Gradually", label: "Gradually" },
      { value: "I'm not sure", label: "I'm not sure" },
    ],
  },
  {
    key: "hair_symptoms",
    field: "hair_symptoms",
    label: "Which of these sound like you? (women, multi)",
    section: "Diagnostic",
    gender: "female",
    array: true,
    options: [
      { value: "My part looks wider than it used to", label: "Part looks wider" },
      { value: "My ponytail feels thinner", label: "Ponytail feels thinner" },
      { value: "I can see more scalp than before", label: "More scalp shows" },
      { value: "I see more hair in the shower or brush", label: "More hair in shower / brush" },
      { value: "My ends feel dry or snap easily", label: "Ends dry / snap" },
      { value: "I have short baby hairs along my part or hairline", label: "Baby hairs along part / hairline" },
      { value: "My scalp feels tender, tight, or sensitive", label: "Scalp tender / tight" },
    ],
  },
  {
    key: "trigger_context",
    field: "trigger_context",
    label: "Did your hair start changing around any of these? (women, multi)",
    section: "Diagnostic",
    gender: "female",
    array: true,
    options: [
      { value: "Postpartum (after having a baby)", label: "Postpartum" },
      { value: "Perimenopause or menopause", label: "Perimenopause / menopause" },
      { value: "After COVID or another illness", label: "After COVID / illness" },
      { value: "A period of major stress", label: "Major stress" },
      { value: "Starting or stopping birth control", label: "Starting / stopping birth control" },
      { value: "Starting or stopping HRT", label: "Starting / stopping HRT" },
      { value: "PCOS", label: "PCOS" },
      { value: "Hypothyroidism or thyroid issues", label: "Thyroid issues" },
      { value: "Low ferritin or iron", label: "Low ferritin / iron" },
      { value: "Tight ponytails, buns, or extensions", label: "Tight styles / extensions" },
      { value: "I'm not sure", label: "Not sure" },
    ],
  },

  // ── Goals (hair goal comes right after the diagnostic block
  // in the app — men use hair_goal single-select, women use
  // hair_goals multi). ───────────────────────────────────────
  {
    key: "hair_goal",
    field: "hair_goal",
    label: "What's your goal? (men)",
    section: "Goals",
    gender: "male",
    options: [
      { value: "stop_the_loss", label: "Stop the loss" },
      { value: "regrow_hair", label: "Regrow hair" },
      { value: "both", label: "Both" },
    ],
  },
  {
    key: "hair_goals_women",
    field: "hair_goals",
    label: "What's your hair goal? (women, multi)",
    section: "Goals",
    gender: "female",
    array: true,
    options: [
      { value: "Stop my hair from thinning", label: "Stop thinning" },
      { value: "Regrow what I've lost", label: "Regrow what I've lost" },
      { value: "Thicker, fuller hair", label: "Thicker, fuller hair" },
      { value: "Support my scalp health", label: "Support scalp health" },
      { value: "Feel more confident", label: "Feel more confident" },
    ],
  },

  // ── Contributing factors (medication → stress → hormonal →
  // tight styles → recent stress → family history in the app). ──
  {
    key: "medication",
    field: "hair_loss_medication",
    label: "Currently on hair-loss medication?",
    section: "Factors",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    key: "stress",
    field: "stress_contribution",
    label: "Do you feel stress could be contributing?",
    section: "Factors",
    options: [
      { value: "yes", label: "Yes" },
      { value: "maybe", label: "Maybe" },
      { value: "no", label: "No" },
    ],
  },
  {
    key: "hormonal",
    field: "hormonal_changes",
    label: "Recent hormonal changes? (women)",
    section: "Factors",
    gender: "female",
    options: [
      { value: "postpartum", label: "Postpartum" },
      { value: "menopause", label: "Menopause / perimenopause" },
      { value: "birth_control", label: "Birth control change" },
      { value: "none", label: "None" },
      { value: "not_sure", label: "Not sure" },
    ],
  },
  {
    key: "tight_hairstyles",
    field: "tight_hairstyles",
    label: "How often tight ponytails/buns/braids? (women)",
    section: "Factors",
    gender: "female",
    options: [
      { value: "daily", label: "Daily" },
      { value: "sometimes", label: "Sometimes" },
      { value: "rarely", label: "Rarely" },
    ],
  },
  {
    key: "recent_stress_event",
    field: "recent_stress_event",
    label: "Recent stressful event? (women)",
    section: "Factors",
    gender: "female",
    options: [
      { value: "Yes", label: "Yes" },
      { value: "No", label: "No" },
    ],
  },
  {
    key: "family_history",
    field: "family_history_men",
    label: "Does hair loss run in your family?",
    section: "Factors",
    options: [
      { value: "yes", label: "Yes" },
      { value: "maybe", label: "Maybe" },
      { value: "no", label: "No" },
      { value: "not_sure", label: "Not sure" },
    ],
  },

  // ── Commitment beats (right before paywall) ────────────────
  {
    key: "hardest_part",
    field: "hardest_part",
    label: "What's the most challenging part?",
    section: "Commitment",
    options: [
      { value: "nothing_works", label: "Nothing has worked" },
      { value: "dont_know", label: "Don't know what to do" },
      { value: "seeing_worse", label: "Seeing it get worse" },
      { value: "hiding", label: "Hiding it" },
    ],
  },
  {
    key: "commitment",
    field: "commitment_answer",
    label: "Can you commit 20 min/day?",
    section: "Commitment",
    options: [{ value: "yes", label: "Yes (advanced past qualifier)" }],
  },
];

// Minimum starter-cohort count for a delta to be trusted. Anything
// smaller and the % swings on 1–2 data points. Also drives the muted
// state on the delta chip.
const MIN_STARTER_COUNT_FOR_TRUST = 20;
// Deltas smaller than this in absolute value are noise, not signal.
const DELTA_NOISE_FLOOR_PP = 3;
// How many rows the TOP SIGNALS panel shows.
const TOP_SIGNALS_LIMIT = 10;

interface Tally {
  counts: Record<string, number>;
  other: number;
  total: number; // total answers (multi-select can exceed answered)
  answered: number; // unique users who answered
}

const emptyTally = (): Tally => ({ counts: {}, other: 0, total: 0, answered: 0 });

interface OptionRow {
  value: string;
  label: string;
  allCount: number;
  startedCount: number;
  allPct: number;
  startedPct: number;
  deltaPp: number; // startedPct - allPct
  trusted: boolean; // starterCount >= MIN_STARTER_COUNT_FOR_TRUST
}

interface QuestionRender {
  question: Question;
  all: Tally;
  started: Tally;
  rows: OptionRow[];
}

type GenderFilter = "all" | "male" | "female";

const GENDER_TABS: Array<{ id: GenderFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "male", label: "Men" },
  { id: "female", label: "Women" },
];

// ── Funnel country filter ────────────────────────────
// Applies only to the Funnel drop-off panel. `tier_1` / `tier_2`
// read the persisted `country_tier` field on the user doc. `us` /
// `india` are timezone-based subsets: they only match users whose
// `userLocalTimeZone` is in the listed set. This lets you slice
// funnel conversion for the two country cohorts we care about
// individually (Meta ad targeting, India pricing decisions).
type CountryFilter = "all" | "tier_1" | "tier_2" | "us" | "india";

const COUNTRY_FUNNEL_TABS: Array<{ id: CountryFilter; label: string }> = [
  { id: "all",    label: "All" },
  { id: "tier_1", label: "Tier 1" },
  { id: "tier_2", label: "Tier 2" },
  { id: "us",     label: "US only" },
  { id: "india",  label: "India only" },
];

const US_TIMEZONES = new Set<string>([
  "America/New_York", "America/Detroit", "America/Kentucky/Louisville",
  "America/Kentucky/Monticello", "America/Indiana/Indianapolis",
  "America/Indiana/Vincennes", "America/Indiana/Winamac",
  "America/Indiana/Marengo", "America/Indiana/Petersburg",
  "America/Indiana/Vevay", "America/Chicago", "America/Indiana/Tell_City",
  "America/Indiana/Knox", "America/Menominee", "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem", "America/North_Dakota/Beulah",
  "America/Denver", "America/Boise", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "America/Juneau",
  "America/Sitka", "America/Metlakatla", "America/Yakutat",
  "America/Nome", "America/Adak", "Pacific/Honolulu",
]);

// Asia/Calcutta is the legacy alias for Asia/Kolkata; both are still
// reported by real user devices — include both so no India user gets
// missed by the filter.
const INDIA_TIMEZONES = new Set<string>([
  "Asia/Kolkata", "Asia/Calcutta",
]);

function matchesCountryFilter(
  filter: CountryFilter,
  d: Record<string, unknown>,
): boolean {
  if (filter === "all") return true;
  const tier = d.country_tier as string | undefined;
  const tz = d.userLocalTimeZone as string | undefined;
  if (filter === "tier_1") return tier === "tier_1";
  if (filter === "tier_2") return tier === "tier_2";
  if (filter === "us") return !!tz && US_TIMEZONES.has(tz);
  if (filter === "india") return !!tz && INDIA_TIMEZONES.has(tz);
  return true;
}

// ── Funnel stages ────────────────────────────────────
// Each stage checks a Firestore field that gets written *when the
// user completes that specific step*. Reaching a later stage
// implies the user passed every earlier stage (the flow is linear),
// so we can infer drop-off between the intermediate screens too even
// when they don't write their own field.
//
// Ordered by flow position. `check` returns true if the user reached
// that stage. All users count toward "Signed up" — the 100% baseline.
interface FunnelStage {
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
const IS_NEW_BUILD_USER = (d: Record<string, unknown>) =>
  !!d.founder_story_started_at;

const FUNNEL_STAGES: FunnelStage[] = [
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

export default async function QuizResponsesPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; c?: string }>;
}) {
  const { db } = getFirebaseAdmin();

  const params = await searchParams;
  const genderRaw = params.g;
  const gender: GenderFilter =
    genderRaw === "male" || genderRaw === "female" ? genderRaw : "all";
  const countryRaw = params.c;
  const country: CountryFilter =
    countryRaw === "tier_1" ||
    countryRaw === "tier_2" ||
    countryRaw === "us" ||
    countryRaw === "india"
      ? countryRaw
      : "all";

  // Pull tally fields + the cohort split field + gender in one pass.
  // We always fetch every user and filter in-memory rather than issuing
  // a where("selected_gender", "==", ...) query, because:
  // (a) the toggle counts in each tab need to reference every user,
  // (b) 100k user docs at ~30 quiz fields each is still <5s, cheaper
  //     than paying for 3 separate reads.
  const quizFields = QUESTIONS.map((q) => q.field);
  const snap = await db
    .collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(RELEASE_CUTOFF))
    .select(
      ...quizFields,
      "started_trial",
      "selected_gender",
      // Funnel event fields — .select() only returns whitelisted fields,
      // so we must list every field a FUNNEL_STAGES.check() reads.
      "founder_story_started_at",
      "pinch_test_started_at",
      "results_screenshots_started_at",
      "paywall_viewed_at",
      // Country-filter inputs — used only by the funnel panel.
      "country_tier",
      "userLocalTimeZone",
      // Email — used only to strip test accounts from the sample.
      "email",
    )
    .get();

  const totalUsers = snap.size;
  const allTallies: Record<string, Tally> = {};
  const startedTallies: Record<string, Tally> = {};
  for (const q of QUESTIONS) {
    allTallies[q.key] = emptyTally();
    startedTallies[q.key] = emptyTally();
  }

  // Tab counts — always computed against the full user base so the
  // toggle shows how big each cohort is regardless of current filter.
  let genderMaleCount = 0;
  let genderFemaleCount = 0;
  let startedCount = 0;

  // Funnel counts respect the gender filter (only in-scope users) AND
  // only count users on the +162 build. Baseline = users who wrote
  // founder_story_started_at (the first new-build write in the flow).
  const funnelCounts: Record<string, number> = {};
  for (const s of FUNNEL_STAGES) funnelCounts[s.key] = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    // Strip test accounts entirely — they'd otherwise skew every %
    // and delta on the small +162 cohort.
    if (isTestEmail(data.email)) continue;
    const docGender = data.selected_gender as string | undefined;
    if (docGender === "male") genderMaleCount++;
    else if (docGender === "female") genderFemaleCount++;

    // Apply the gender filter: skip users who don't match the selected
    // tab. Users with no selected_gender are only included in "all".
    if (gender === "male" && docGender !== "male") continue;
    if (gender === "female" && docGender !== "female") continue;

    const isStarter = !!data.started_trial;
    if (isStarter) startedCount++;

    // Funnel only counts users on the new build. Legacy users don't
    // have `founder_story_started_at`, so they don't inflate the
    // baseline (which would drive every stage % to ~0). Also applies
    // the country filter — All / Tier 1 / Tier 2 / US / India.
    if (IS_NEW_BUILD_USER(data) && matchesCountryFilter(country, data)) {
      for (const s of FUNNEL_STAGES) {
        if (s.check(data)) funnelCounts[s.key]++;
      }
    }

    for (const q of QUESTIONS) {
      const raw = data[q.field];
      if (raw === undefined || raw === null) continue;
      const validValues = new Set(q.options.map((o) => o.value));

      // Tally into both All (always) and Started (if isStarter).
      const targets: Tally[] = isStarter
        ? [allTallies[q.key], startedTallies[q.key]]
        : [allTallies[q.key]];

      if (q.array) {
        if (!Array.isArray(raw) || raw.length === 0) continue;
        for (const t of targets) t.answered++;
        for (const v of raw) {
          const s = String(v);
          for (const t of targets) {
            if (validValues.has(s)) t.counts[s] = (t.counts[s] ?? 0) + 1;
            else t.other++;
            t.total++;
          }
        }
      } else {
        const s = String(raw);
        if (s === "") continue;
        for (const t of targets) {
          t.answered++;
          t.total++;
          if (validValues.has(s)) t.counts[s] = (t.counts[s] ?? 0) + 1;
          else t.other++;
        }
      }
    }
  }

  // Build rows per question with denominators + deltas.
  const rendered: QuestionRender[] = QUESTIONS.map((q) => {
    const all = allTallies[q.key];
    const started = startedTallies[q.key];
    const allDenom = q.array ? all.total : all.answered;
    const startedDenom = q.array ? started.total : started.answered;

    const rows: OptionRow[] = q.options.map((o) => {
      const allCount = all.counts[o.value] ?? 0;
      const startedCountOpt = started.counts[o.value] ?? 0;
      const allPct = allDenom === 0 ? 0 : (allCount / allDenom) * 100;
      const startedPct =
        startedDenom === 0 ? 0 : (startedCountOpt / startedDenom) * 100;
      return {
        value: o.value,
        label: o.label,
        allCount,
        startedCount: startedCountOpt,
        allPct,
        startedPct,
        deltaPp: startedPct - allPct,
        trusted: startedCountOpt >= MIN_STARTER_COUNT_FOR_TRUST,
      };
    });

    // Sort by absolute delta desc — sticks-out answers bubble to top.
    rows.sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp));

    return { question: q, all, started, rows };
  });

  // TOP SIGNALS — same gender-tab filter as the per-question cards.
  // On All, only universal questions can contribute signals.
  const allSignals = rendered
    .filter((r) => {
      const g = r.question.gender;
      if (gender === "male") return g === undefined || g === "male";
      if (gender === "female") return g === undefined || g === "female";
      return g === undefined;
    })
    .flatMap((r) =>
      r.rows.map((row) => ({
        question: r.question,
        row,
      }))
    )
    .filter((s) => s.row.trusted && Math.abs(s.row.deltaPp) >= DELTA_NOISE_FLOOR_PP)
    .sort((a, b) => Math.abs(b.row.deltaPp) - Math.abs(a.row.deltaPp))
    .slice(0, TOP_SIGNALS_LIMIT);

  // Gender-scoped visibility:
  //   All   → only universal questions (no gender tag) so the page
  //           is scannable without mixing men-only + women-only cards
  //   Men   → universal + male-tagged
  //   Women → universal + female-tagged
  // Users who want to see a specific gendered question switch tab.
  const visibleForTab = rendered.filter((r) => {
    const g = r.question.gender;
    if (gender === "male") return g === undefined || g === "male";
    if (gender === "female") return g === undefined || g === "female";
    return g === undefined; // All tab
  });

  // Group questions by section for the render.
  const sections: Record<string, QuestionRender[]> = {};
  for (const r of visibleForTab) {
    (sections[r.question.section] ??= []).push(r);
  }

  const scopeLabel =
    gender === "male" ? "Men only" : gender === "female" ? "Women only" : "All users";

  return (
    <div>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>
          Quiz responses
        </h1>
        <p
          style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}
        >
          {scopeLabel} · signups since{" "}
          {RELEASE_CUTOFF.toISOString().slice(0, 10)} (build 162 release) ·{" "}
          <span style={{ color: "#8affc1" }}>
            {startedCount.toLocaleString()} started trial
          </span>
          . Each card shows how many people answered that question; each
          option shows All → Started with the delta.
        </p>
      </header>

      <GenderTabs
        selected={gender}
        totals={{ all: totalUsers, male: genderMaleCount, female: genderFemaleCount }}
        country={country}
      />

      <FunnelPanel counts={funnelCounts} country={country} gender={gender} />

      <TopSignalsPanel
        signals={allSignals}
        startedCount={startedCount}
      />

      {Object.entries(sections).map(([section, qs]) => (
        <section key={section} style={{ marginBottom: 40 }}>
          <h2
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.2,
              color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase",
              margin: "0 0 14px",
            }}
          >
            {section}
          </h2>
          <div style={{ display: "grid", gap: 12 }}>
            {qs.map((r) => (
              <QuestionCard key={r.question.key} rendered={r} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FunnelPanel({
  counts,
  country,
  gender,
}: {
  counts: Record<string, number>;
  country: CountryFilter;
  gender: GenderFilter;
}) {
  const baseline = counts[FUNNEL_STAGES[0].key] || 1;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 16,
        marginBottom: 32,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.2,
          color: "rgba(255,255,255,0.55)",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        Funnel drop-off
      </div>
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.4)",
          marginBottom: 14,
        }}
      >
        % of {baseline.toLocaleString()} signups (since build 162 release)
        that reached each stage.
      </div>

      <FunnelCountryTabs selected={country} gender={gender} />
      <div style={{ display: "grid", gap: 6 }}>
        {FUNNEL_STAGES.map((s) => {
          const count = counts[s.key] ?? 0;
          const pct = (count / baseline) * 100;
          return (
            <div
              key={s.key}
              style={{
                display: "grid",
                gridTemplateColumns: "150px 1fr 110px",
                alignItems: "center",
                gap: 12,
                padding: "6px 0",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.85)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  height: 6,
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(pct, 100)}%`,
                    height: "100%",
                    background: "#fff",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.75)",
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                }}
              >
                {pct.toFixed(1)}%
                <span style={{ color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>
                  {count.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FunnelCountryTabs({
  selected,
  gender,
}: {
  selected: CountryFilter;
  gender: GenderFilter;
}) {
  // Keep the gender param in the URL when switching country tab so the
  // rest of the page (per-question cards, top signals) doesn't reset.
  const genderParam = gender === "all" ? "" : `g=${gender}`;
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 2,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 999,
        padding: 3,
        marginBottom: 14,
      }}
    >
      {COUNTRY_FUNNEL_TABS.map((tab) => {
        const active = tab.id === selected;
        const parts: string[] = [];
        if (genderParam) parts.push(genderParam);
        if (tab.id !== "all") parts.push(`c=${tab.id}`);
        const href = parts.length === 0 ? "?" : `?${parts.join("&")}`;
        return (
          <a
            key={tab.id}
            href={href}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              background: active ? "#fff" : "transparent",
              color: active ? "#000" : "rgba(255,255,255,0.65)",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {tab.label}
          </a>
        );
      })}
    </div>
  );
}

function GenderTabs({
  selected,
  totals,
  country,
}: {
  selected: GenderFilter;
  totals: { all: number; male: number; female: number };
  country: CountryFilter;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 2,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 999,
        padding: 3,
        marginBottom: 24,
      }}
    >
      {GENDER_TABS.map((tab) => {
        const active = tab.id === selected;
        const count = totals[tab.id];
        // Preserve the country filter across gender switches so users
        // who set "US only" don't lose it when flipping Men → Women.
        const parts: string[] = [];
        if (tab.id !== "all") parts.push(`g=${tab.id}`);
        if (country !== "all") parts.push(`c=${country}`);
        const href = parts.length === 0 ? "?" : `?${parts.join("&")}`;
        return (
          <a
            key={tab.id}
            href={href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: 999,
              background: active ? "#fff" : "transparent",
              color: active ? "#000" : "rgba(255,255,255,0.65)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {tab.label}
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                opacity: 0.55,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {count.toLocaleString()}
            </span>
          </a>
        );
      })}
    </div>
  );
}

function TopSignalsPanel({
  signals,
  startedCount,
}: {
  signals: Array<{ question: Question; row: OptionRow }>;
  startedCount: number;
}) {
  return (
    <div
      style={{
        background: "rgba(138,255,193,0.06)",
        border: "1px solid rgba(138,255,193,0.18)",
        borderRadius: 12,
        padding: 16,
        marginBottom: 32,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.2,
          color: "#8affc1",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        Top signals
      </div>
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.5)",
          marginBottom: 14,
        }}
      >
        Quiz answers most associated with trial-start. Filtered to options
        with ≥{MIN_STARTER_COUNT_FOR_TRUST} starter responses and ≥
        {DELTA_NOISE_FLOOR_PP}pp delta.
      </div>

      {startedCount < MIN_STARTER_COUNT_FOR_TRUST ? (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
          Not enough trial-starters yet ({startedCount} so far). Panel activates
          once the new `started_trial` field accumulates ≥
          {MIN_STARTER_COUNT_FOR_TRUST} paywall completions from the new
          release.
        </div>
      ) : signals.length === 0 ? (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
          No meaningful signals yet — every option's delta is under the noise
          floor.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {signals.map((s, i) => (
            <SignalRow key={`${s.question.key}:${s.row.value}`} rank={i + 1} signal={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SignalRow({
  rank,
  signal,
}: {
  rank: number;
  signal: { question: Question; row: OptionRow };
}) {
  const { question, row } = signal;
  const positive = row.deltaPp > 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 4px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        style={{
          width: 18,
          fontSize: 12,
          color: "rgba(255,255,255,0.35)",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {rank}.
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#fff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {row.label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {question.label}
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.55)",
          fontVariantNumeric: "tabular-nums",
          minWidth: 130,
          textAlign: "right",
        }}
      >
        {row.allPct.toFixed(0)}% → {row.startedPct.toFixed(0)}%
      </div>
      <DeltaChip deltaPp={row.deltaPp} trusted large />
      <div style={{ width: 16, textAlign: "center", fontSize: 12 }}>
        {positive ? (
          <span style={{ color: "#8affc1" }}>▲</span>
        ) : (
          <span style={{ color: "#ff8a8a" }}>▼</span>
        )}
      </div>
    </div>
  );
}

function QuestionCard({ rendered }: { rendered: QuestionRender }) {
  const { question, all, started, rows } = rendered;

  // Sort by All-cohort count desc so the most popular answer is
  // always at the top — that's the intuitive default. The prior
  // "sort by |delta|" was only meaningful at large N and confusing
  // at small N when deltas are noise. We keep delta info per row
  // but the reading order matches a poll.
  const sortedRows = [...rows].sort((a, b) => b.allCount - a.allCount);

  // Show the starter comparison bar whenever any trial-starters
  // have answered this question. Below MIN_STARTER_COUNT_FOR_TRUST
  // the bar is drawn in a lighter tint so the user knows to treat
  // it as directional, not conclusive.
  const showStartedComparison = started.answered > 0;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 16,
          gap: 12,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", lineHeight: 1.35 }}>
          {question.label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.55)",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 500,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "#fff", fontWeight: 600 }}>
            {all.answered.toLocaleString()}
          </span>{" "}
          all
          {showStartedComparison && (
            <>
              {" · "}
              <span
                style={{
                  color: started.answered >= MIN_STARTER_COUNT_FOR_TRUST
                    ? "#8affc1"
                    : "rgba(138,255,193,0.55)",
                  fontWeight: 600,
                }}
              >
                {started.answered.toLocaleString()} started
              </span>
              {started.answered < MIN_STARTER_COUNT_FOR_TRUST && (
                <span
                  style={{
                    color: "rgba(138,255,193,0.4)",
                    fontWeight: 400,
                    marginLeft: 4,
                  }}
                >
                  (low N)
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {all.answered === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          No responses yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {sortedRows.map((r) => (
            <PollRow
              key={r.value}
              row={r}
              maxCount={sortedRows[0]?.allCount || 1}
              showStartedComparison={showStartedComparison}
            />
          ))}
          {all.other > 0 && (
            <PollRow
              row={{
                value: "__other__",
                label: "Other / unmapped",
                allCount: all.other,
                startedCount: started.other,
                allPct: (all.other / (all.total || 1)) * 100,
                startedPct: (started.other / (started.total || 1)) * 100,
                deltaPp: 0,
                trusted: false,
              }}
              maxCount={sortedRows[0]?.allCount || 1}
              showStartedComparison={showStartedComparison}
              muted
            />
          )}
        </div>
      )}
    </div>
  );
}

function PollRow({
  row,
  maxCount,
  showStartedComparison,
  muted = false,
}: {
  row: OptionRow;
  maxCount: number;
  showStartedComparison: boolean;
  muted?: boolean;
}) {
  // Both bars use the same scale (max = top option's overall count)
  // so their widths are directly comparable. Starter bar is drawn
  // proportional to the same denominator so "which is longer" reads
  // instantly — that's the intuitive delta signal.
  const allBarPct = maxCount === 0 ? 0 : (row.allCount / maxCount) * 100;
  const startedShareOfMax =
    row.startedPct === 0 ? 0 : (row.startedPct / (row.allPct || 1)) * allBarPct;

  const labelColor = muted ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.9)";
  const numColor = muted ? "rgba(255,255,255,0.4)" : "#fff";
  const countColor = muted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.4)";
  return (
    <div style={{ display: "grid", gap: 5 }}>
      {/* Label + overall pct/count + delta indicator */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div
          style={{
            fontSize: 13,
            color: labelColor,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {row.label}
        </div>
        <div
          style={{
            fontSize: 13,
            fontVariantNumeric: "tabular-nums",
            color: numColor,
            fontWeight: 500,
            flexShrink: 0,
            display: "flex",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <span>{row.allPct.toFixed(1)}%</span>
          <span style={{ color: countColor, fontWeight: 400 }}>
            {row.allCount.toLocaleString()}
          </span>
          {showStartedComparison && (
            <DeltaInline deltaPp={row.deltaPp} trusted={row.trusted} />
          )}
        </div>
      </div>

      {/* Overall bar — white */}
      <div
        style={{
          height: 6,
          background: "rgba(255,255,255,0.05)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.max(allBarPct, row.allCount > 0 ? 2 : 0)}%`,
            height: "100%",
            background: muted ? "rgba(255,255,255,0.15)" : "#fff",
            borderRadius: 3,
          }}
        />
      </div>

      {/* Starter bar — same full width as the white bar above so
          equal %s produce visually identical lengths. Label sits
          BELOW the bar, right-aligned, so the two bars can be
          compared directly at a glance. */}
      {showStartedComparison && (
        <>
          <div
            style={{
              height: 4,
              background: "rgba(138,255,193,0.05)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.max(startedShareOfMax, row.startedCount > 0 ? 2 : 0)}%`,
                height: "100%",
                background: row.trusted ? "#8affc1" : "rgba(138,255,193,0.4)",
                borderRadius: 3,
              }}
            />
          </div>
          <div
            style={{
              fontSize: 11,
              fontVariantNumeric: "tabular-nums",
              color: row.trusted
                ? "rgba(138,255,193,0.75)"
                : "rgba(138,255,193,0.45)",
              textAlign: "right",
              fontWeight: 500,
              marginTop: 1,
            }}
          >
            starters {row.startedPct.toFixed(1)}%
            <span style={{ opacity: 0.6, marginLeft: 5, fontWeight: 400 }}>
              ({row.startedCount})
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// Compact inline delta indicator shown on each option row when
// starter cohort is large enough to trust. Keeps the compare feature
// but doesn't take a whole column.
function DeltaInline({
  deltaPp,
  trusted,
}: {
  deltaPp: number;
  trusted: boolean;
}) {
  const abs = Math.abs(deltaPp);
  if (!trusted || abs < DELTA_NOISE_FLOOR_PP) {
    return <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>·</span>;
  }
  const positive = deltaPp > 0;
  const color = positive ? "#8affc1" : "#ff8a8a";
  const arrow = positive ? "▲" : "▼";
  const sign = positive ? "+" : "−";
  return (
    <span
      title={`${positive ? "+" : "−"}${abs.toFixed(1)}pp among trial starters`}
      style={{
        color,
        fontSize: 11,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {arrow} {sign}
      {abs.toFixed(1)}pp
    </span>
  );
}

function DeltaChip({
  deltaPp,
  trusted,
  large = false,
}: {
  deltaPp: number;
  trusted: boolean;
  large?: boolean;
}) {
  const absDelta = Math.abs(deltaPp);
  const isNoise = absDelta < DELTA_NOISE_FLOOR_PP;
  const positive = deltaPp > 0;

  // Muted style if: cohort too small OR delta below noise floor.
  const muted = !trusted || isNoise;
  const color = muted
    ? "rgba(255,255,255,0.35)"
    : positive
      ? "#8affc1"
      : "#ff8a8a";
  const bg = muted
    ? "rgba(255,255,255,0.05)"
    : positive
      ? "rgba(138,255,193,0.12)"
      : "rgba(255,138,138,0.12)";

  const sign = positive ? "+" : deltaPp < 0 ? "−" : "";
  const display = deltaPp === 0 && !trusted ? "—" : `${sign}${absDelta.toFixed(1)}pp`;

  return (
    <div
      style={{
        fontSize: large ? 13 : 11,
        fontWeight: 600,
        color,
        background: bg,
        padding: large ? "4px 10px" : "3px 7px",
        borderRadius: 12,
        textAlign: "center",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: 0.2,
        minWidth: large ? 78 : 60,
      }}
      title={
        !trusted
          ? `Cohort too small (n<${MIN_STARTER_COUNT_FOR_TRUST}) — delta not trusted`
          : isNoise
            ? `Delta under ${DELTA_NOISE_FLOOR_PP}pp noise floor`
            : `${sign}${absDelta.toFixed(1)}pp shift vs All`
      }
    >
      {display}
    </div>
  );
}
