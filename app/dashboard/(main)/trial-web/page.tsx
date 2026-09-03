// WEB VARIANT of /dashboard/trial.
//
// Same engagement + outcome breakdown as the mobile trial dashboard,
// filtered to users who came through the /start web funnel:
// `payment_provider == "stripe"` OR `signup_source == "web_onboarding"`.
//
// Caveat: per-day engagement (`progress.dayN`) is only populated once
// the user installs the mobile app and completes an exercise. Web-only
// users (paid on web, haven't installed yet) show up as "still in trial"
// with day-1 activity = 0. That's correct behavior — the trial outcome
// metrics (converted / cancelled) still work from `trial_status` written
// by the trial-subscription webhook.

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import Link from "next/link";
import { Day1HoverRow } from "./Day1HoverRow";
import { CohortPicker } from "../_lib/CohortPicker";
import {
  WEB_RELEASES,
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

  const perDayCounts = new Array(TRIAL_DAYS).fill(0);
  const perDayEligible = new Array(TRIAL_DAYS).fill(0);
  for (const u of users) {
    if (u.startedAtMs === null) continue;
    const tenureDays = Math.floor((now - u.startedAtMs) / DAY_MS);
    for (let i = 0; i < TRIAL_DAYS; i++) {
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
  searchParams: Promise<{ g?: string; baseline?: string; new?: string; compare?: string }>;
}) {
  const { db } = getFirebaseAdmin();
  const params = await searchParams;
  const genderRaw = params.g;
  const gender: GenderFilter =
    genderRaw === "male" || genderRaw === "female" ? genderRaw : "all";

  const compareMode = params.compare === "1";

  // Resolve "new" cohort. Default: newest release.
  const newSlug = params.new ?? WEB_RELEASES[0]?.slug ?? "";
  const newRel = getRelease(newSlug);
  const newWin = getReleaseWindow(newSlug, WEB_RELEASES);

  // Baseline only used in compare mode. Auto-picks previous release.
  const baselineSlug = compareMode
    ? params.baseline ?? getPreviousRelease(newSlug, WEB_RELEASES)?.slug ?? WEB_RELEASES[WEB_RELEASES.length - 1]?.slug ?? newSlug
    : null;
  const baselineWin = baselineSlug ? getReleaseWindow(baselineSlug, WEB_RELEASES) : null;

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
      // Web-specific: attach-identity writes trial_started_at (equivalent
      // to mobile's started_trial) + payment_provider="stripe" for every
      // paid web trial. Either flag qualifies as a trial-starter here.
      "trial_started_at", "trial_status", "payment_provider", "signup_source",
    )
    .get();

  const baselineUsers: TrialUser[] = [];
  const newUsers: TrialUser[] = [];
  let baselineSignups = 0;
  let newSignups = 0;

  // Web-only filter — mirrors onboarding-web. attach-identity writes
  // payment_provider="stripe" for every paid web trial; signup_source is
  // a belt-and-suspenders fallback for older/edge-case users.
  const isWebUser = (d: Record<string, unknown>): boolean =>
    d.payment_provider === "stripe" || d.signup_source === "web_onboarding";

  for (const doc of snap.docs) {
    const d = doc.data();
    if (isTestEmail(d.email)) continue;
    if (!isWebUser(d)) continue;

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

    if (inNew) newSignups++;
    if (inBaseline) baselineSignups++;

    // Accept either the mobile started_trial flag OR the web
    // trial_started_at timestamp (attach-identity writes the latter).
    if (!d.started_trial && !d.trial_started_at) continue;

    const progress = (d.progress as Record<string, Array<{ is_completed?: boolean }> | undefined> | undefined) ?? {};
    const perDay: boolean[] = [];
    let daysCompleted = 0, day1Done = 0, day1Total = 0;
    for (let day = 1; day <= TRIAL_DAYS; day++) {
      const entries = progress[`day${day}`];
      const opened = Array.isArray(entries) && entries.length > 0;
      const doneCount = opened ? entries!.filter((e) => e?.is_completed === true).length : 0;
      perDay.push(doneCount > 0);
      if (doneCount > 0) daysCompleted++;
      if (day === 1) { day1Total = opened ? entries!.length : 0; day1Done = doneCount; }
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
      // Web trial outcome fields are written by the trial-subscription
      // webhook: trial_status transitions active → converted → cancelled.
      // Mobile writes converted_trial + subscription_status. Accept both.
      converted:
        !!d.converted_trial ||
        d.trial_status === "converted",
      cancelled:
        d.subscription_status === "cancelled" ||
        d.trial_status === "cancelled",
    };

    if (inNew) newUsers.push(user);
    if (inBaseline) baselineUsers.push(user);
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
            Trial · Web
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
            {newM.total.toLocaleString()} trials · {newRel?.label ?? "current"} ({newRel?.date ?? "-"})
          </p>
        </div>
        <CompareToggle compareMode={compareMode} gender={gender} />
      </header>

      {compareMode && (
        <CohortPicker
          baselineSlug={baselineSlug!}
          newSlug={newSlug}
          labelForKey={METRIC_KEYS.trial}
          releases={WEB_RELEASES}
        />
      )}

      <GenderTabs
        selected={gender}
        totals={{ all: newM.total, male: newM.genderMale, female: newM.genderFemale }}
        compareMode={compareMode}
      />

      <OutcomesStrip
        m={newM}
        base={baseM}
        tracks={tracks}
      />

      <FunnelPanel rows={newM.funnel} base={baseM?.funnel} baseTotal={baseM?.total} tracks={tracks} />

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

      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 24 }}>
        Day 13 check-in is post-trial — see{" "}
        <Link href="/dashboard/retention" style={{ color: "rgba(255,255,255,0.55)" }}>Retention</Link>.
      </p>
    </div>
  );
}

// ── Toggle button ───────────────────────────────────────────────────

function CompareToggle({ compareMode, gender }: { compareMode: boolean; gender: GenderFilter }) {
  const genderParam = gender === "all" ? "" : `&g=${gender}`;
  const href = compareMode ? `/dashboard/trial-web${genderParam ? `?${genderParam.slice(1)}` : ""}` : `/dashboard/trial-web?compare=1${genderParam}`;
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

function FunnelPanel({ rows, base, baseTotal, tracks }: {
  rows: Array<{ key: string; label: string; count: number }>;
  base?: Array<{ key: string; label: string; count: number }>;
  baseTotal?: number;
  tracks: Set<string>;
}) {
  const baseline = rows[0].count || 1;
  return (
    <PanelWrap title="Funnel" subtitle={`% of ${baseline.toLocaleString()} trials that reached each stage.`}>
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r) => {
          const pct = (r.count / baseline) * 100;
          const baseRow = base?.find((b) => b.key === r.key);
          const basePct = baseRow && baseTotal ? (baseRow.count / (baseTotal || 1)) * 100 : null;
          const barColor = r.key === "funnel_converted" ? "#359033" : "#fff";
          return (
            <div key={r.key} style={{
              display: "grid",
              gridTemplateColumns: "170px 1fr 150px",
              alignItems: "center",
              gap: 12,
              padding: "6px 0 6px 8px",
              borderLeft: trackedBorder(r.key, tracks),
            }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{r.label}</div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: barColor }} />
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                {pct.toFixed(1)}%
                <span style={{ color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>{r.count.toLocaleString()}</span>
                <DeltaChip metricKey={r.key} newPct={pct} basePct={basePct} />
              </div>
            </div>
          );
        })}
      </div>
    </PanelWrap>
  );
}

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
        {counts.map((count, i) => {
          const day = i + 1;
          const metricKey = `perday_day${day}`;
          const elig = eligible[i];
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

function GenderTabs({ selected, totals, compareMode }: {
  selected: GenderFilter;
  totals: { all: number; male: number; female: number };
  compareMode: boolean;
}) {
  const compareParam = compareMode ? "&compare=1" : "";
  return (
    <div style={{ display: "inline-flex", gap: 2, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, padding: 3, marginBottom: 20 }}>
      {GENDER_TABS.map((t) => {
        const active = t.key === selected;
        const base = t.key === "all" ? "/dashboard/trial-web" : `/dashboard/trial-web?g=${t.key}`;
        const href = compareMode
          ? (t.key === "all" ? `/dashboard/trial-web?compare=1` : `${base}${compareParam}`)
          : base;
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
