// Trial funnel — engagement + outcome for every user who started a trial
// since build +162 (2026-08-18).
//
// Default view: single cohort (the newest release), original layout.
// Comparison mode: toggled via ?compare=1 — adds baseline vs new
// dropdowns and inline delta pills on tracked metrics from release-history.

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import Link from "next/link";
import { Day1HoverRow } from "./Day1HoverRow";
import { CohortPicker } from "../_lib/CohortPicker";
import { VersionTabs } from "../_lib/VersionTabs";
import { InstallSourceTabs } from "../_lib/InstallSourceTabs";
import {
  matchesInstallSource,
  type InstallSourceFilter,
} from "../_lib/installSource";
import { CountryTabs } from "../_lib/CountryTabs";
import {
  matchesCountryFilter,
  parseCountryFilter,
  type CountryFilter,
} from "../_lib/countryFilter";
import {
  MOBILE_RELEASES,
  METRIC_KEYS,
  METRIC_DIRECTIONS,
  getRelease,
  getReleaseWindow,
  getPreviousRelease,
} from "@/lib/release-history";

export const dynamic = "force-dynamic";

const TEST_EMAIL_REGEX = /^test\d+@test\.com$/i;
const isTestEmail = (email: unknown): boolean =>
  typeof email === "string" && TEST_EMAIL_REGEX.test(email);

const TRIAL_DAYS = 7;
const DAY_MS = 86_400_000;

// Days shown in the per-day completion panel: the full trial (1-7)
// plus two post-trial retention beats — Day 10 (3 days into paid) and
// Day 14 (1 week into paid). Skipping 8/9/11/12/13 keeps the panel
// focused on the beats that matter (trial engagement + first
// retention checkpoints).
const DISPLAYED_DAYS = [1, 2, 3, 4, 5, 6, 7, 10, 14];
const MAX_TRACKED_DAY = 14;

type GenderFilter = "all" | "male" | "female";
const GENDER_TABS: Array<{ key: GenderFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "male", label: "Men" },
  { key: "female", label: "Women" },
];

type Answer = "yes" | "no" | "not_sure";
interface CheckInCounts { yes: number; no: number; not_sure: number; total: number }
const emptyCheckIn = (): CheckInCounts => ({ yes: 0, no: 0, not_sure: 0, total: 0 });

interface TrialUser {
  createdMs: number;
  gender: string | undefined;
  startedAtMs: number | null;
  daysCompleted: number;
  perDay: boolean[];
  day1Done: number;
  day1Total: number;
  checkIn3: Answer | null;
  checkIn6: Answer | null;
  converted: boolean;
  cancelled: boolean;
}

function tsToMs(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  const s = t._seconds ?? t.seconds;
  return typeof s === "number" ? s * 1000 : null;
}

// ── Metrics for one cohort ──────────────────────────────────────────

interface CohortMetrics {
  total: number;
  perDayCounts: number[];
  perDayEligible: number[];
  checkIn3: CheckInCounts;
  checkIn6: CheckInCounts;
  outcomes: { converted: number; cancelled: number; stillInTrial: number };
  funnel: Array<{ key: string; label: string; count: number }>;
  day1Distribution: number[];
  day1NeverOpened: number;
  day1MaxTotal: number;
  genderMale: number;
  genderFemale: number;
  allSignups: number;   // for gender-tab total
}

function computeMetrics(users: TrialUser[], allSignupsInCohort: number, now: number): CohortMetrics {
  const total = users.length;
  const converted = users.filter((u) => u.converted).length;
  const cancelled = users.filter((u) => u.cancelled).length;
  const stillInTrial = Math.max(0, total - converted - cancelled);

  const funnel = [
    { key: "funnel_started",    label: "Trial started",           count: total },
    { key: "funnel_day_gte_1",  label: "Did ≥ 1 day",             count: users.filter((u) => u.daysCompleted >= 1).length },
    { key: "funnel_day_gte_3",  label: "Did ≥ 3 days",            count: users.filter((u) => u.daysCompleted >= 3).length },
    { key: "funnel_day_gte_5",  label: "Did ≥ 5 days",            count: users.filter((u) => u.daysCompleted >= 5).length },
    { key: "funnel_day_all",    label: `Did all ${TRIAL_DAYS} days`, count: users.filter((u) => u.daysCompleted >= TRIAL_DAYS).length },
    { key: "funnel_converted",  label: "Converted to paid",       count: converted },
  ];

  // Track through MAX_TRACKED_DAY (14) so the panel can show Day 10 and
  // Day 14 alongside the trial days. Trial-related metrics (funnel,
  // gradient) still only use days 1..TRIAL_DAYS.
  const perDayCounts = new Array(MAX_TRACKED_DAY).fill(0);
  const perDayEligible = new Array(MAX_TRACKED_DAY).fill(0);
  for (const u of users) {
    if (u.startedAtMs === null) continue;
    const tenureDays = Math.floor((now - u.startedAtMs) / DAY_MS);
    for (let i = 0; i < MAX_TRACKED_DAY; i++) {
      if (tenureDays >= i) {
        perDayEligible[i]++;
        if (u.perDay[i]) perDayCounts[i]++;
      }
    }
  }

  let day1MaxTotal = 0;
  for (const u of users) if (u.day1Total > day1MaxTotal) day1MaxTotal = u.day1Total;
  const day1Distribution = new Array(day1MaxTotal + 1).fill(0);
  let day1NeverOpened = 0;
  for (const u of users) {
    if (u.startedAtMs === null) continue;
    if (u.day1Total === 0) { day1NeverOpened++; continue; }
    day1Distribution[u.day1Done] = (day1Distribution[u.day1Done] ?? 0) + 1;
  }

  const checkIn3 = emptyCheckIn();
  const checkIn6 = emptyCheckIn();
  for (const u of users) {
    if (u.checkIn3) { checkIn3[u.checkIn3]++; checkIn3.total++; }
    if (u.checkIn6) { checkIn6[u.checkIn6]++; checkIn6.total++; }
  }

  return {
    total,
    perDayCounts,
    perDayEligible,
    checkIn3,
    checkIn6,
    outcomes: { converted, cancelled, stillInTrial },
    funnel,
    day1Distribution,
    day1NeverOpened,
    day1MaxTotal,
    genderMale: users.filter((u) => u.gender === "male").length,
    genderFemale: users.filter((u) => u.gender === "female").length,
    allSignups: allSignupsInCohort,
  };
}

// ── Page ────────────────────────────────────────────────────────────

export default async function TrialPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; s?: string; c?: string; baseline?: string; new?: string; compare?: string }>;
}) {
  const { db } = getFirebaseAdmin();
  const params = await searchParams;
  const genderRaw = params.g;
  const gender: GenderFilter =
    genderRaw === "male" || genderRaw === "female" ? genderRaw : "all";
  const sourceRaw = params.s;
  const source: InstallSourceFilter =
    sourceRaw === "paid" || sourceRaw === "organic" ? sourceRaw : "all";
  const country: CountryFilter = parseCountryFilter(params.c);

  const compareMode = params.compare === "1";

  // Resolve "new" cohort. Default: newest release.
  const newSlug = params.new ?? MOBILE_RELEASES[0]?.slug ?? "";
  const newRel = getRelease(newSlug);
  const newWin = getReleaseWindow(newSlug, MOBILE_RELEASES);

  // Baseline only used in compare mode. Auto-picks previous release.
  const baselineSlug = compareMode
    ? params.baseline ?? getPreviousRelease(newSlug, MOBILE_RELEASES)?.slug ?? MOBILE_RELEASES[MOBILE_RELEASES.length - 1]?.slug ?? newSlug
    : null;
  const baselineWin = baselineSlug ? getReleaseWindow(baselineSlug, MOBILE_RELEASES) : null;

  // Query union of both windows so a single query fills either mode.
  const earliestFrom = new Date(
    Math.min(baselineWin?.from.getTime() ?? Infinity, newWin?.from.getTime() ?? Date.now()),
  );
  const latestTo = new Date(
    Math.max(baselineWin?.to.getTime() ?? 0, newWin?.to.getTime() ?? Date.now()),
  );

  const snap = await db
    .collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(earliestFrom))
    .where("created_at", "<=", Timestamp.fromDate(latestTo))
    .select(
      "started_trial", "converted_trial", "subscription_status", "progress",
      "scalp_check_answers", "selected_gender", "email", "created_at",
      // Install-source filter — backfilled from RC by
      // /api/rc/backfill-attribution. Slices paid-ad vs organic cohorts.
      "install_source",
      // Country filter inputs — tier_1/tier_2 from persisted
      // country_tier, us/india from userLocalTimeZone.
      "country_tier",
      "userLocalTimeZone",
      // p9 alarm walkthrough acceptance — recorded on completion or
      // skip-confirm. Split rendered as a small card below the funnel.
      "alarm_walkthrough_outcome",
    )
    .get();

  const baselineUsers: TrialUser[] = [];
  const newUsers: TrialUser[] = [];
  let baselineSignups = 0;
  let newSignups = 0;
  // p9 alarm walkthrough split — counted for the "new" cohort only,
  // post filters (gender / source / country). Excludes users without
  // an outcome recorded (pre-p9 cohort or splash-backfill users).
  let alarmCompleted = 0;
  let alarmSkipped = 0;
  // Install-source pill counts — reflect the current gender + cohort
  // filter state so the tab counts match what clicking would show.
  // Binary: paid vs everything else (organic absorbs missing/legacy).
  const sourceCounts = { all: 0, paid: 0, organic: 0 };
  // Country pill counts — same shape as source. Computed post-gender
  // + post-source so pill counts show what clicking each tab would
  // yield with the other filters held constant.
  const countryCounts: Record<CountryFilter, number> = {
    all: 0, tier_1: 0, tier_2: 0, us: 0, india: 0,
  };

  for (const doc of snap.docs) {
    const d = doc.data();
    if (isTestEmail(d.email)) continue;

    const docGender = d.selected_gender as string | undefined;
    if (gender === "male" && docGender !== "male") continue;
    if (gender === "female" && docGender !== "female") continue;

    const createdMs = tsToMs(d.created_at);
    if (createdMs === null) continue;

    const inNew = newWin && createdMs >= newWin.from.getTime() && createdMs < newWin.to.getTime();
    const inBaseline =
      compareMode && baselineWin &&
      createdMs >= baselineWin.from.getTime() && createdMs < baselineWin.to.getTime();

    if (!inNew && !inBaseline) continue;

    // Tally install-source pill counts for the "new" cohort only —
    // that's the primary view. Then apply the source filter. Anything
    // that isn't explicitly "paid" rolls into organic so legacy nulls
    // land in the right bucket without a migration.
    if (inNew) {
      const rawSource = d.install_source as string | undefined;
      const bucket: "paid" | "organic" = rawSource === "paid" ? "paid" : "organic";
      sourceCounts.all++;
      sourceCounts[bucket]++;
    }
    if (!matchesInstallSource(source, d)) continue;

    // Country pill counts, same idea — post source filter so counts
    // reflect the current slice. `all` is the running total; each
    // country is a subset.
    if (inNew) {
      countryCounts.all++;
      if (matchesCountryFilter("tier_1", d)) countryCounts.tier_1++;
      if (matchesCountryFilter("tier_2", d)) countryCounts.tier_2++;
      if (matchesCountryFilter("us", d)) countryCounts.us++;
      if (matchesCountryFilter("india", d)) countryCounts.india++;
    }
    if (!matchesCountryFilter(country, d)) continue;

    if (inNew) newSignups++;
    if (inBaseline) baselineSignups++;

    if (!d.started_trial) continue;

    const progress = (d.progress as Record<string, Array<{ is_completed?: boolean }> | undefined> | undefined) ?? {};
    const perDay: boolean[] = [];
    let daysCompleted = 0, day1Done = 0, day1Total = 0;
    // Loop through MAX_TRACKED_DAY so we can also record Day 10 / 14
    // fully-complete status. daysCompleted still only counts trial
    // days (1..TRIAL_DAYS) because it drives the engagement gradient.
    for (let day = 1; day <= MAX_TRACKED_DAY; day++) {
      const entries = progress[`day${day}`];
      const opened = Array.isArray(entries) && entries.length > 0;
      const doneCount = opened ? entries!.filter((e) => e?.is_completed === true).length : 0;
      // "Day complete" = ALL tasks marked is_completed. Previously this
      // was `doneCount > 0` (any single task) which was misleading —
      // the panel's own label says "% that completed each day", so it
      // needs to mean fully complete.
      const totalCount = opened ? entries!.length : 0;
      const dayFullyDone = totalCount > 0 && doneCount === totalCount;
      perDay.push(dayFullyDone);
      if (dayFullyDone && day <= TRIAL_DAYS) daysCompleted++;
      if (day === 1) { day1Total = totalCount; day1Done = doneCount; }
    }

    const answers = (d.scalp_check_answers as Record<string, string> | undefined) ?? {};
    const parseAns = (raw: string | undefined): Answer | null =>
      raw === "yes" || raw === "no" || raw === "not_sure" ? raw : null;

    const startedTrial = d.started_trial as { at?: unknown } | undefined;

    const user: TrialUser = {
      createdMs,
      gender: docGender,
      startedAtMs: tsToMs(startedTrial?.at),
      daysCompleted,
      perDay,
      day1Done,
      day1Total,
      checkIn3: parseAns(answers["3"]),
      checkIn6: parseAns(answers["6"]),
      converted: !!d.converted_trial,
      cancelled: d.subscription_status === "cancelled",
    };

    if (inNew) newUsers.push(user);
    if (inBaseline) baselineUsers.push(user);

    // Alarm walkthrough outcome — count only new-cohort users so the
    // card reflects the same slice as the funnel above.
    if (inNew) {
      const outcome = d.alarm_walkthrough_outcome as string | undefined;
      if (outcome === "completed") alarmCompleted++;
      else if (outcome === "skipped") alarmSkipped++;
    }
  }

  const now = Date.now();
  const newM = computeMetrics(newUsers, newSignups, now);
  const baseM = compareMode ? computeMetrics(baselineUsers, baselineSignups, now) : null;
  const tracks = new Set(newRel?.tracks ?? []);

  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>
            Trial
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
            {newM.total.toLocaleString()} trials · {newRel?.label ?? "current"} ({newRel?.date ?? "-"})
          </p>
        </div>
        <CompareToggle compareMode={compareMode} gender={gender} source={source} country={country} />
      </header>

      {compareMode ? (
        <CohortPicker
          baselineSlug={baselineSlug!}
          newSlug={newSlug}
          labelForKey={METRIC_KEYS.trial}
          releases={MOBILE_RELEASES}
        />
      ) : (
        <VersionTabs selectedSlug={newSlug} releases={MOBILE_RELEASES} />
      )}

      <GenderTabs
        selected={gender}
        totals={{ all: newM.total, male: newM.genderMale, female: newM.genderFemale }}
        compareMode={compareMode}
        source={source}
        country={country}
      />

      <CountryTabs selected={country} totals={countryCounts} />

      <InstallSourceTabs selected={source} totals={sourceCounts} />

      <OutcomesStrip
        m={newM}
        base={baseM}
        tracks={tracks}
      />

      <PaidQualityCard users={newUsers} />

      <EngagementGradientPanel users={newUsers} />

      <PerDayPanel
        counts={newM.perDayCounts}
        eligible={newM.perDayEligible}
        baseCounts={baseM?.perDayCounts}
        baseEligible={baseM?.perDayEligible}
        day1={{ distribution: newM.day1Distribution, neverOpened: newM.day1NeverOpened, maxTotal: newM.day1MaxTotal }}
        tracks={tracks}
      />

      <div style={{ display: "grid", gap: 12 }}>
        <CheckInCard day={3} counts={newM.checkIn3} />
        <CheckInCard day={6} counts={newM.checkIn6} />
      </div>

      <AlarmWalkthroughCard completed={alarmCompleted} skipped={alarmSkipped} />

      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 24 }}>
        Day 13 check-in is post-trial — see{" "}
        <Link href="/dashboard/retention" style={{ color: "rgba(255,255,255,0.55)" }}>Retention</Link>.
      </p>
    </div>
  );
}

// ── Alarm walkthrough (p9) — Help me set it up vs Skip ──────────
// Small strip showing the split. Users without a recorded outcome
// (pre-p9 cohort or splash-backfill re-runs) are excluded from the
// denominator so % isn't diluted by legacy noise.
function AlarmWalkthroughCard({ completed, skipped }: { completed: number; skipped: number }) {
  const total = completed + skipped;
  const completedPct = total === 0 ? 0 : (completed / total) * 100;
  const skippedPct = total === 0 ? 0 : (skipped / total) * 100;
  return (
    <div
      style={{
        marginTop: 24,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Alarm walkthrough</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
          <span style={{ color: "#fff", fontWeight: 600 }}>{total.toLocaleString()}</span> answered
        </div>
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>
        Help me set it up vs Skip on the Day-1 alarm walkthrough (p9).
      </div>
      {total === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No answers yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {[
            { key: "completed", label: "Help me set it up", color: "#5AB758", count: completed, pct: completedPct },
            { key: "skipped", label: "Skip", color: "#DAA520", count: skipped, pct: skippedPct },
          ].map((r) => (
            <div key={r.key} style={{ display: "grid", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: "inline-block" }} />
                  <span>{r.label}</span>
                </div>
                <div style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", color: "#fff", fontWeight: 500, display: "flex", gap: 8 }}>
                  <span>{r.pct.toFixed(1)}%</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>{r.count.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${r.pct}%`, height: "100%", background: r.color, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Toggle button ───────────────────────────────────────────────────

function CompareToggle({
  compareMode,
  gender,
  source,
  country,
}: {
  compareMode: boolean;
  gender: GenderFilter;
  source: InstallSourceFilter;
  country: CountryFilter;
}) {
  // Preserve gender + source + country filters across compare toggle
  // so users don't lose their slice when flipping into/out of compare.
  const parts: string[] = [];
  if (!compareMode) parts.push("compare=1");
  if (gender !== "all") parts.push(`g=${gender}`);
  if (source !== "all") parts.push(`s=${source}`);
  if (country !== "all") parts.push(`c=${country}`);
  const href = parts.length === 0 ? "/dashboard/trial" : `/dashboard/trial?${parts.join("&")}`;
  return (
    <Link
      href={href}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        background: compareMode ? "rgba(218,165,32,0.15)" : "rgba(255,255,255,0.06)",
        color: compareMode ? "#DAA520" : "rgba(255,255,255,0.75)",
        border: compareMode ? "1px solid rgba(218,165,32,0.3)" : "1px solid rgba(255,255,255,0.1)",
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      {compareMode ? "✓ Comparing" : "Compare cohorts"}
    </Link>
  );
}

// ── Delta chip (only rendered in compare mode) ─────────────────────

function DeltaChip({ metricKey, newPct, basePct }: { metricKey: string; newPct: number; basePct: number | null }) {
  if (basePct === null || isNaN(basePct)) return null;
  const delta = newPct - basePct;
  if (Math.abs(delta) < 0.5) {
    return (
      <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(218,165,32,0.15)", color: "#DAA520", marginLeft: 6 }}>
        ~ flat
      </span>
    );
  }
  const dir = METRIC_DIRECTIONS[metricKey] ?? "higher_better";
  const improved = dir === "higher_better" ? delta > 0 : delta < 0;
  const bg = improved ? "rgba(53,144,51,0.18)" : "rgba(192,62,6,0.18)";
  const color = improved ? "#5AB758" : "#E06A3F";
  return (
    <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: bg, color, marginLeft: 6 }}>
      {delta > 0 ? "+" : ""}{delta.toFixed(1)}pp
    </span>
  );
}

function trackedBorder(metricKey: string, tracks: Set<string>): string {
  return tracks.has(metricKey) ? "3px solid #DAA520" : "3px solid transparent";
}

// ── Outcomes strip ──────────────────────────────────────────────────

function OutcomesStrip({ m, base, tracks }: {
  m: CohortMetrics;
  base: CohortMetrics | null;
  tracks: Set<string>;
}) {
  const total = m.total || 1;
  const items = [
    { key: "outcome_converted",     label: "Converted",     count: m.outcomes.converted,   baseCount: base?.outcomes.converted,   baseTotal: base?.total, color: "#359033" },
    { key: "outcome_cancelled",     label: "Cancelled",     count: m.outcomes.cancelled,   baseCount: base?.outcomes.cancelled,   baseTotal: base?.total, color: "#C03E06" },
    { key: "outcome_still_in_trial", label: "Still in trial", count: m.outcomes.stillInTrial, baseCount: base?.outcomes.stillInTrial, baseTotal: base?.total, color: "rgba(255,255,255,0.55)" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 20 }}>
      {items.map((it) => {
        const pct = (it.count / total) * 100;
        const basePct = it.baseCount !== undefined && it.baseTotal ? (it.baseCount / it.baseTotal) * 100 : null;
        return (
          <div key={it.key} style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderLeft: trackedBorder(it.key, tracks),
            borderRadius: 12,
            padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color }} />
              {it.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
              {it.count.toLocaleString()}
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 400, marginLeft: 8 }}>
                {pct.toFixed(1)}%
              </span>
              <DeltaChip metricKey={it.key} newPct={pct} basePct={basePct} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Funnel panel ────────────────────────────────────────────────────

// FunnelPanel removed — replaced by EngagementGradientPanel above,
// which shows the same days-completed axis plus paid conversion rate
// per bucket (strict superset of what the funnel showed).

// ── Per-day panel ──────────────────────────────────────────────────

function PerDayPanel({
  counts, eligible, baseCounts, baseEligible, day1, tracks,
}: {
  counts: number[]; eligible: number[];
  baseCounts?: number[]; baseEligible?: number[];
  day1: { distribution: number[]; neverOpened: number; maxTotal: number };
  tracks: Set<string>;
}) {
  return (
    <PanelWrap
      title="Per-day completion"
      subtitle="% of trials that completed each specific day, over trials old enough to have reached it. Order-independent."
    >
      <div style={{ display: "grid", gap: 6 }}>
        {DISPLAYED_DAYS.map((day) => {
          const i = day - 1;
          const count = counts[i] ?? 0;
          const metricKey = `perday_day${day}`;
          const elig = eligible[i] ?? 0;
          const pct = elig === 0 ? 0 : (count / elig) * 100;
          const baseElig = baseEligible?.[i] ?? 0;
          const basePct = baseElig > 0 && baseCounts ? (baseCounts[i] / baseElig) * 100 : null;

          if (day === 1) {
            return (
              <div key={day} style={{ borderLeft: trackedBorder(metricKey, tracks), paddingLeft: 8 }}>
                <Day1HoverRow
                  count={count}
                  eligible={elig}
                  distribution={day1.distribution}
                  neverOpened={day1.neverOpened}
                  maxTotal={day1.maxTotal}
                />
                {basePct !== null && (
                  <div style={{ textAlign: "right", marginTop: -8, marginBottom: 4 }}>
                    <DeltaChip metricKey={metricKey} newPct={pct} basePct={basePct} />
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={day} style={{
              display: "grid",
              gridTemplateColumns: "80px 1fr 150px",
              alignItems: "center",
              gap: 12,
              padding: "6px 0 6px 8px",
              borderLeft: trackedBorder(metricKey, tracks),
            }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>Day {day}</div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: elig === 0 ? "rgba(255,255,255,0.2)" : "#fff" }} />
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                {elig === 0 ? (
                  <span style={{ color: "rgba(255,255,255,0.35)" }}>—</span>
                ) : (
                  <>
                    {pct.toFixed(1)}%
                    <span style={{ color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>{count}/{elig}</span>
                    <DeltaChip metricKey={metricKey} newPct={pct} basePct={basePct} />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PanelWrap>
  );
}

function PanelWrap({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.2, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", marginBottom: 4 }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>{subtitle}</div>
      )}
      {children}
    </div>
  );
}

// ── Check-in card + gender tabs (unchanged from original) ──────────

function CheckInCard({ day, counts }: { day: number; counts: CheckInCounts }) {
  const total = counts.total;
  interface Row { key: Answer; label: string; color: string; count: number; pct: number }
  const rows: Row[] = [
    { key: "yes", label: "Yes — looser", color: "#359033", count: counts.yes, pct: 0 },
    { key: "not_sure", label: "Not sure", color: "#DAA520", count: counts.not_sure, pct: 0 },
    { key: "no", label: "No — still tight", color: "#C03E06", count: counts.no, pct: 0 },
  ];
  for (const r of rows) r.pct = total === 0 ? 0 : (r.count / total) * 100;
  rows.sort((a, b) => b.count - a.count);
  const maxCount = rows[0]?.count || 1;

  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Day {day} check-in</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
          <span style={{ color: "#fff", fontWeight: 600 }}>{total.toLocaleString()}</span> answered
        </div>
      </div>
      {total === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No responses yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r) => (
            <div key={r.key} style={{ display: "grid", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: "inline-block" }} />
                  <span>{r.label}</span>
                </div>
                <div style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", color: "#fff", fontWeight: 500, display: "flex", gap: 8 }}>
                  <span>{r.pct.toFixed(1)}%</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>{r.count.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${Math.max((r.count / maxCount) * 100, r.count > 0 ? 2 : 0)}%`, height: "100%", background: r.color, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GenderTabs({ selected, totals, compareMode, source, country }: {
  selected: GenderFilter;
  totals: { all: number; male: number; female: number };
  compareMode: boolean;
  source: InstallSourceFilter;
  country: CountryFilter;
}) {
  return (
    <div style={{ display: "inline-flex", gap: 2, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, padding: 3, marginBottom: 20 }}>
      {GENDER_TABS.map((t) => {
        const active = t.key === selected;
        const parts: string[] = [];
        if (t.key !== "all") parts.push(`g=${t.key}`);
        if (compareMode) parts.push("compare=1");
        if (source !== "all") parts.push(`s=${source}`);
        if (country !== "all") parts.push(`c=${country}`);
        const href = parts.length === 0 ? "/dashboard/trial" : `/dashboard/trial?${parts.join("&")}`;
        const count = t.key === "all" ? totals.all : t.key === "male" ? totals.male : totals.female;
        return (
          <Link key={t.key} href={href} style={{
            padding: "6px 14px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 500,
            color: active ? "#000" : "rgba(255,255,255,0.75)",
            background: active ? "#fff" : "transparent",
            textDecoration: "none",
            fontVariantNumeric: "tabular-nums",
          }}>
            {t.label} <span style={{ opacity: 0.5, marginLeft: 4 }}>{count.toLocaleString()}</span>
          </Link>
        );
      })}
    </div>
  );
}

// ── Paid-quality KPI: % of paying users who engaged with ≥ 1 day ──
function PaidQualityCard({ users }: { users: TrialUser[] }) {
  const paid = users.filter((u) => u.converted);
  if (paid.length === 0) {
    return (
      <div style={{
        marginBottom: 20,
        padding: "14px 18px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        fontSize: 12,
        color: "rgba(255,255,255,0.5)",
      }}>
        Paid quality: no paid users in this cohort yet.
      </div>
    );
  }
  const engaged = paid.filter((u) => u.daysCompleted >= 1).length;
  const pct = engaged / paid.length;
  const pctStr = (pct * 100).toFixed(0) + "%";
  const color = pct >= 0.85 ? "#8affc1" : pct >= 0.70 ? "#f0c674" : "#ff8f8f";
  const light = pct >= 0.85
    ? "rgba(138,255,193,0.08)"
    : pct >= 0.70
    ? "rgba(240,198,116,0.08)"
    : "rgba(255,143,143,0.08)";
  return (
    <div style={{
      marginBottom: 20,
      padding: "12px 18px",
      background: light,
      border: `1px solid ${color}33`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      display: "flex",
      alignItems: "center",
      gap: 12,
      fontSize: 13,
      color: "rgba(255,255,255,0.8)",
    }}>
      <span style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {pctStr}
      </span>
      <span>
        of paying users engaged with ≥ 1 day{" "}
        <span style={{ color: "rgba(255,255,255,0.4)" }}>
          ({engaged.toLocaleString()} / {paid.length.toLocaleString()})
        </span>
      </span>
      <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
        Health: {pct >= 0.85 ? "engaged" : pct >= 0.70 ? "mixed" : "forgot-to-cancel risk"}
      </span>
    </div>
  );
}

// ── Engagement gradient: paid conversion rate by trial-days completed ──
function EngagementGradientPanel({ users }: { users: TrialUser[] }) {
  if (users.length === 0) return null;

  // Bucket by days completed. 5-7 grouped because n gets thin at the tail.
  const buckets = [
    { label: "0",     min: 0, max: 0 },
    { label: "1",     min: 1, max: 1 },
    { label: "2",     min: 2, max: 2 },
    { label: "3-4",   min: 3, max: 4 },
    { label: "5-7",   min: 5, max: 7 },
  ];
  const rows = buckets.map((b) => {
    const inBucket = users.filter((u) => u.daysCompleted >= b.min && u.daysCompleted <= b.max);
    const paid = inBucket.filter((u) => u.converted).length;
    return { label: b.label, n: inBucket.length, paid, rate: inBucket.length ? paid / inBucket.length : 0 };
  });
  const baseRate = users.filter((u) => u.converted).length / users.length;
  const maxRate = Math.max(...rows.map((r) => r.rate), baseRate, 0.01);

  return (
    <div style={{
      marginBottom: 28,
      padding: "16px 18px",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.4)",
        marginBottom: 4,
      }}>
        Trial engagement → paid
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>
        Paid conversion rate sliced by how many trial days each user fully completed (all tasks done).
        Base rate: <span style={{ color: "#fff" }}>{(baseRate * 100).toFixed(1)}%</span>.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "60px 80px 60px 80px 1fr", rowGap: 6, columnGap: 12, alignItems: "center", fontSize: 12 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase" }}>Days</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", textAlign: "right" }}>Users</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", textAlign: "right" }}>Paid</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", textAlign: "right" }}>Rate</div>
        <div />
        {rows.map((r) => {
          const delta = r.rate - baseRate;
          const barWidth = maxRate > 0 ? (r.rate / maxRate) * 100 : 0;
          const barColor = delta >= 0.05 ? "#8affc1" : delta <= -0.03 ? "#ff8f8f" : "rgba(255,255,255,0.4)";
          return (
            <>
              <div key={r.label + "-d"} style={{ fontWeight: 600 }}>{r.label}</div>
              <div key={r.label + "-n"} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,0.7)" }}>{r.n.toLocaleString()}</div>
              <div key={r.label + "-p"} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,0.7)" }}>{r.paid.toLocaleString()}</div>
              <div key={r.label + "-r"} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                {(r.rate * 100).toFixed(1)}%
              </div>
              <div key={r.label + "-b"} style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${barWidth}%`, height: "100%", background: barColor, borderRadius: 4 }} />
              </div>
            </>
          );
        })}
      </div>
    </div>
  );
}
