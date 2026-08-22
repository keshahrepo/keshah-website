// Trial funnel — engagement + outcome for every trial-starter. Now
// renders two cohorts side-by-side (baseline vs new release) with
// tracked-metric highlights driven by lib/release-history.ts.
//
// URL params:
//   ?baseline=<slug>  — release to use as baseline (default: 2nd newest)
//   ?new=<slug>       — release to compare (default: newest)
//   ?g=male|female    — gender filter (applies to both cohorts)

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import Link from "next/link";
// Note: Day1HoverRow was used in single-cohort mode to show exercise-completion
// distribution on hover. Not integrated in the side-by-side view for now — the
// cohort comparison delta is more useful than the exercise-count breakdown.
// Re-add later if the breakdown matters more than the compare.
import { CohortPicker } from "../_lib/CohortPicker";
import {
  RELEASES,
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

// ── Metric computation for one cohort ────────────────────────────────

interface CohortMetrics {
  total: number;               // trials started in this cohort
  allSignups: number;          // all signups in this cohort (denominator for started rate)
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
    allSignups: allSignupsInCohort,
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
  };
}

// ── Page ─────────────────────────────────────────────────────────────

export default async function TrialPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; baseline?: string; new?: string }>;
}) {
  const { db } = getFirebaseAdmin();
  const params = await searchParams;
  const genderRaw = params.g;
  const gender: GenderFilter =
    genderRaw === "male" || genderRaw === "female" ? genderRaw : "all";

  // Resolve which two releases we're comparing. Defaults: newest as "new",
  // second-newest as "baseline". If only one release exists, both point at it.
  const newSlug = params.new ?? RELEASES[0]?.slug ?? "";
  const baselineSlug =
    params.baseline ??
    getPreviousRelease(newSlug)?.slug ??
    RELEASES[RELEASES.length - 1]?.slug ??
    newSlug;

  const baselineRel = getRelease(baselineSlug);
  const newRel = getRelease(newSlug);
  const baselineWin = getReleaseWindow(baselineSlug);
  const newWin = getReleaseWindow(newSlug);

  // Union query — pull all users created between the earliest and latest
  // window boundary, then split in-memory into the two cohorts.
  const earliestFrom = new Date(
    Math.min(baselineWin?.from.getTime() ?? Infinity, newWin?.from.getTime() ?? Infinity),
  );
  const latestTo = new Date(
    Math.max(baselineWin?.to.getTime() ?? 0, newWin?.to.getTime() ?? 0),
  );

  const snap = await db
    .collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(earliestFrom))
    .where("created_at", "<=", Timestamp.fromDate(latestTo))
    .select(
      "started_trial",
      "converted_trial",
      "subscription_status",
      "progress",
      "scalp_check_answers",
      "selected_gender",
      "email",
      "created_at",
    )
    .get();

  const baselineUsers: TrialUser[] = [];
  const newUsers: TrialUser[] = [];
  let baselineSignups = 0;
  let newSignups = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    if (isTestEmail(d.email)) continue;

    const docGender = d.selected_gender as string | undefined;
    if (gender === "male" && docGender !== "male") continue;
    if (gender === "female" && docGender !== "female") continue;

    const createdMs = tsToMs(d.created_at);
    if (createdMs === null) continue;

    const inBaseline =
      baselineWin && createdMs >= baselineWin.from.getTime() && createdMs < baselineWin.to.getTime();
    const inNew =
      newWin && createdMs >= newWin.from.getTime() && createdMs < newWin.to.getTime();

    if (!inBaseline && !inNew) continue;

    // Count all signups (denominator for "trial started rate")
    if (inBaseline) baselineSignups++;
    if (inNew) newSignups++;

    if (!d.started_trial) continue;

    const progress = (d.progress as Record<string, Array<{ is_completed?: boolean }> | undefined> | undefined) ?? {};
    const perDay: boolean[] = [];
    let daysCompleted = 0;
    let day1Done = 0;
    let day1Total = 0;
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
      converted: !!d.converted_trial,
      cancelled: d.subscription_status === "cancelled",
    };

    if (inBaseline) baselineUsers.push(user);
    if (inNew) newUsers.push(user);
  }

  const now = Date.now();
  const baseM = computeMetrics(baselineUsers, baselineSignups, now);
  const newM = computeMetrics(newUsers, newSignups, now);

  const tracks = new Set(newRel?.tracks ?? []);

  return (
    <div>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>
          Trial
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
          Two cohorts side-by-side. Yellow left-border = metric this release is
          tracking. Green = improved in the right direction, red = regressed.
        </p>
      </header>

      <CohortPicker
        baselineSlug={baselineSlug}
        newSlug={newSlug}
        labelForKey={METRIC_KEYS.trial}
      />

      <GenderTabs
        selected={gender}
        totals={{
          all: baseM.total + newM.total,
          male: baseM.genderMale + newM.genderMale,
          female: baseM.genderFemale + newM.genderFemale,
        }}
      />

      <TwoCohortView
        baselineLabel={baselineRel?.label ?? "baseline"}
        newLabel={newRel?.label ?? "new"}
        baseM={baseM}
        newM={newM}
        tracks={tracks}
      />

      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 24 }}>
        Day 13 check-in is post-trial — see{" "}
        <Link href="/dashboard/retention" style={{ color: "rgba(255,255,255,0.55)" }}>
          Retention
        </Link>
        .
      </p>
    </div>
  );
}

// ── Side-by-side view ───────────────────────────────────────────────

function TwoCohortView({
  baselineLabel,
  newLabel,
  baseM,
  newM,
  tracks,
}: {
  baselineLabel: string;
  newLabel: string;
  baseM: CohortMetrics;
  newM: CohortMetrics;
  tracks: Set<string>;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
      }}
    >
      <CohortColumn
        label={baselineLabel}
        m={baseM}
        tracks={tracks}
        compareAgainst={null}
        isBaseline
      />
      <CohortColumn
        label={newLabel}
        m={newM}
        tracks={tracks}
        compareAgainst={baseM}
        isBaseline={false}
      />
    </div>
  );
}

function CohortColumn({
  label,
  m,
  tracks,
  compareAgainst,
  isBaseline,
}: {
  label: string;
  m: CohortMetrics;
  tracks: Set<string>;
  compareAgainst: CohortMetrics | null;
  isBaseline: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: isBaseline ? "rgba(255,255,255,0.4)" : "#DAA520",
          marginBottom: 8,
        }}
      >
        {label}
        <span
          style={{
            marginLeft: 8,
            color: "rgba(255,255,255,0.55)",
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {m.total.toLocaleString()} trials · {m.allSignups.toLocaleString()} signups
        </span>
      </div>

      {/* Outcomes strip — one row per outcome */}
      <Panel title="Outcomes">
        <ComparisonRow
          metricKey="outcome_converted"
          label="Converted"
          count={m.outcomes.converted}
          base={m.total}
          color="#359033"
          compare={compareAgainst ? { count: compareAgainst.outcomes.converted, base: compareAgainst.total } : null}
          tracks={tracks}
        />
        <ComparisonRow
          metricKey="outcome_cancelled"
          label="Cancelled"
          count={m.outcomes.cancelled}
          base={m.total}
          color="#C03E06"
          compare={compareAgainst ? { count: compareAgainst.outcomes.cancelled, base: compareAgainst.total } : null}
          tracks={tracks}
        />
        <ComparisonRow
          metricKey="outcome_still_in_trial"
          label="Still in trial"
          count={m.outcomes.stillInTrial}
          base={m.total}
          color="rgba(255,255,255,0.55)"
          compare={compareAgainst ? { count: compareAgainst.outcomes.stillInTrial, base: compareAgainst.total } : null}
          tracks={tracks}
        />
      </Panel>

      <Panel title="Funnel">
        {m.funnel.map((r) => (
          <ComparisonRow
            key={r.key}
            metricKey={r.key}
            label={r.label}
            count={r.count}
            base={m.total || 1}
            color="#fff"
            compare={
              compareAgainst
                ? {
                    count: compareAgainst.funnel.find((f) => f.key === r.key)?.count ?? 0,
                    base: compareAgainst.total || 1,
                  }
                : null
            }
            tracks={tracks}
          />
        ))}
      </Panel>

      <Panel title="Per-day completion">
        {m.perDayCounts.map((cnt, i) => (
          <ComparisonRow
            key={i}
            metricKey={`perday_day${i + 1}`}
            label={`Day ${i + 1}`}
            count={cnt}
            base={m.perDayEligible[i] || 0}
            color="#fff"
            compare={
              compareAgainst
                ? {
                    count: compareAgainst.perDayCounts[i] ?? 0,
                    base: compareAgainst.perDayEligible[i] || 0,
                  }
                : null
            }
            tracks={tracks}
          />
        ))}
      </Panel>

      <Panel title="Check-ins">
        <CheckInSummary label="Day 3" counts={m.checkIn3} />
        <CheckInSummary label="Day 6" counts={m.checkIn6} />
      </Panel>
    </div>
  );
}

// ── Reusable pieces ─────────────────────────────────────────────────

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.2,
          color: "rgba(255,255,255,0.55)",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div style={{ display: "grid", gap: 6 }}>{children}</div>
    </div>
  );
}

function ComparisonRow({
  metricKey,
  label,
  count,
  base,
  color,
  compare,
  tracks,
}: {
  metricKey: string;
  label: string;
  count: number;
  base: number;
  color: string;
  compare: { count: number; base: number } | null;
  tracks: Set<string>;
}) {
  const pct = base === 0 ? 0 : (count / base) * 100;
  const comparePct =
    compare && compare.base > 0 ? (compare.count / compare.base) * 100 : null;
  const deltaPp = comparePct !== null ? pct - comparePct : null;
  const isTracked = tracks.has(metricKey);
  const direction = METRIC_DIRECTIONS[metricKey] ?? "higher_better";

  // Border color logic — only on tracked metrics in the NEW column (where `compare` is set)
  let borderColor: string | null = null;
  if (isTracked && compare !== null) {
    if (deltaPp === null || Math.abs(deltaPp) < 0.5) {
      borderColor = "#DAA520"; // tracked but no change yet
    } else {
      const improved =
        direction === "higher_better" ? deltaPp > 0 : deltaPp < 0;
      borderColor = improved ? "#359033" : "#C03E06";
    }
  } else if (isTracked && compare === null) {
    // Baseline column: subtle yellow tint so eye still lands there
    borderColor = "rgba(218,165,32,0.4)";
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 8,
        padding: "5px 0 5px 8px",
        borderLeft: borderColor ? `3px solid ${borderColor}` : "3px solid transparent",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </div>
        <div
          style={{
            height: 4,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(pct, 100)}%`,
              height: "100%",
              background: color,
            }}
          />
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
          minWidth: 90,
        }}
      >
        <div style={{ color: "#fff", fontWeight: 500 }}>
          {base === 0 ? (
            <span style={{ color: "rgba(255,255,255,0.35)" }}>—</span>
          ) : (
            <>
              {pct.toFixed(1)}%
              <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 6, fontWeight: 400 }}>
                {count}/{base}
              </span>
            </>
          )}
        </div>
        {deltaPp !== null && Math.abs(deltaPp) >= 0.5 && (
          <div
            style={{
              fontSize: 10,
              marginTop: 2,
              color:
                (METRIC_DIRECTIONS[metricKey] === "lower_better" ? deltaPp < 0 : deltaPp > 0)
                  ? "#5AB758"
                  : "#E06A3F",
            }}
          >
            {deltaPp > 0 ? "+" : ""}{deltaPp.toFixed(1)}pp
          </div>
        )}
      </div>
    </div>
  );
}

function CheckInSummary({ label, counts }: { label: string; counts: CheckInCounts }) {
  const total = counts.total;
  if (total === 0) {
    return (
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", padding: "4px 8px" }}>
        {label}: no answers yet.
      </div>
    );
  }
  const rows = [
    { key: "yes", label: "Yes — looser", color: "#359033", count: counts.yes },
    { key: "not_sure", label: "Not sure", color: "#DAA520", count: counts.not_sure },
    { key: "no", label: "No — still tight", color: "#C03E06", count: counts.no },
  ];
  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
        {label}{" "}
        <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 400 }}>
          ({total} answered)
        </span>
      </div>
      {rows.map((r) => {
        const pct = (r.count / total) * 100;
        return (
          <div
            key={r.key}
            style={{
              display: "grid",
              gridTemplateColumns: "10px 1fr auto",
              gap: 6,
              alignItems: "center",
              padding: "2px 0",
              fontSize: 11,
            }}
          >
            <span style={{ width: 6, height: 6, background: r.color, borderRadius: 1 }} />
            <span style={{ color: "rgba(255,255,255,0.85)" }}>{r.label}</span>
            <span style={{ color: "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}>
              {pct.toFixed(0)}% ({r.count})
            </span>
          </div>
        );
      })}
    </div>
  );
}

function GenderTabs({
  selected,
  totals,
}: {
  selected: GenderFilter;
  totals: { all: number; male: number; female: number };
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
        marginBottom: 16,
      }}
    >
      {GENDER_TABS.map((t) => {
        const active = t.key === selected;
        const href = t.key === "all" ? "/dashboard/trial" : `/dashboard/trial?g=${t.key}`;
        const count =
          t.key === "all" ? totals.all
          : t.key === "male" ? totals.male
          : totals.female;
        return (
          <Link
            key={t.key}
            href={href}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              color: active ? "#000" : "rgba(255,255,255,0.75)",
              background: active ? "#fff" : "transparent",
              textDecoration: "none",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {t.label}{" "}
            <span style={{ opacity: 0.5, marginLeft: 4 }}>{count.toLocaleString()}</span>
          </Link>
        );
      })}
    </div>
  );
}
