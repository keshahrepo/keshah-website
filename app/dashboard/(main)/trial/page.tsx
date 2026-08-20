// Trial funnel — engagement + outcome for every user who started a trial
// since build +162 (2026-08-18). Answers "of people who started a trial,
// how many actually engage, and how many convert?"
//
// The funnel is cumulative on days completed rather than sequential (a
// user can do Day 2 without Day 3, so "did ≥N days" is the natural bucket).
// Check-ins live inside the trial window (Day 3 + Day 6). Day 13 is post-
// trial and lives on the retention page.
//
// Cancelled bar depends on the RC webhook writing subscription_status
// (added 2026-08-19). Old cancels won't appear here; going-forward only.

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Same cohort marker as the onboarding page — build +162 shipped on this
// date with started_trial writes. Anything older is legacy data with no
// trial signals.
const RELEASE_CUTOFF = new Date("2026-08-18T00:00:00Z");

const TEST_EMAIL_REGEX = /^test\d+@test\.com$/i;
const isTestEmail = (email: unknown): boolean =>
  typeof email === "string" && TEST_EMAIL_REGEX.test(email);

// Trial length in days. If this ever changes, only edit the constant —
// per-day heatmap, cumulative buckets, and check-in placement all key
// off it.
const TRIAL_DAYS = 7;

type GenderFilter = "all" | "male" | "female";
const GENDER_TABS: Array<{ key: GenderFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "male", label: "Men" },
  { key: "female", label: "Women" },
];

type Answer = "yes" | "no" | "not_sure";
interface CheckInCounts {
  yes: number;
  no: number;
  not_sure: number;
  total: number;
}
const emptyCheckIn = (): CheckInCounts => ({ yes: 0, no: 0, not_sure: 0, total: 0 });

interface TrialUser {
  gender: string | undefined;
  daysCompleted: number;            // 0..TRIAL_DAYS — how many progress.dayN.is_completed = true
  perDay: boolean[];                // length = TRIAL_DAYS, true if that specific day was completed
  checkIn3: Answer | null;
  checkIn6: Answer | null;
  converted: boolean;
  cancelled: boolean;
}

export default async function TrialPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  const { db } = getFirebaseAdmin();
  const params = await searchParams;
  const genderRaw = params.g;
  const gender: GenderFilter =
    genderRaw === "male" || genderRaw === "female" ? genderRaw : "all";

  // Base cohort: every user who created their account since +162.
  // We in-memory filter to `started_trial != null` because Firestore
  // can't compound `created_at >=` with `started_trial != null` without
  // an extra index. Cheap tradeoff at this volume.
  const snap = await db
    .collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(RELEASE_CUTOFF))
    .select(
      "started_trial",
      "converted_trial",
      "subscription_status",
      "progress",
      "scalp_check_answers",
      "selected_gender",
      "email",
    )
    .get();

  const users: TrialUser[] = [];
  let allTrialsCount = 0;   // total trials regardless of gender — for the "All" tab count
  let genderMale = 0;
  let genderFemale = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    if (isTestEmail(d.email)) continue;
    if (!d.started_trial) continue;      // trial funnel — only people who started

    allTrialsCount++;
    const docGender = d.selected_gender as string | undefined;
    if (docGender === "male") genderMale++;
    else if (docGender === "female") genderFemale++;

    if (gender === "male" && docGender !== "male") continue;
    if (gender === "female" && docGender !== "female") continue;

    // Days completed — count progress.day1..day7 with is_completed === true.
    // The `is_completed` bool matters (not just presence) because opening
    // the day screen pre-populates the entry as is_completed:false.
    const progress = (d.progress as Record<string, { is_completed?: boolean }> | undefined) ?? {};
    const perDay: boolean[] = [];
    let daysCompleted = 0;
    for (let day = 1; day <= TRIAL_DAYS; day++) {
      const done = progress[`day${day}`]?.is_completed === true;
      perDay.push(done);
      if (done) daysCompleted++;
    }

    // Check-in answers live in scalp_check_answers as string-keyed map.
    const answers = (d.scalp_check_answers as Record<string, string> | undefined) ?? {};
    const parseAns = (raw: string | undefined): Answer | null =>
      raw === "yes" || raw === "no" || raw === "not_sure" ? raw : null;

    users.push({
      gender: docGender,
      daysCompleted,
      perDay,
      checkIn3: parseAns(answers["3"]),
      checkIn6: parseAns(answers["6"]),
      converted: !!d.converted_trial,
      cancelled: d.subscription_status === "cancelled",
    });
  }

  const total = users.length;

  // ── Funnel (cumulative days completed) ─────────────────────────
  interface FunnelRow { key: string; label: string; count: number }
  const funnel: FunnelRow[] = [
    { key: "started",    label: "Trial started",           count: total },
    { key: "day_gte_1",  label: "Did ≥ 1 day",             count: users.filter((u) => u.daysCompleted >= 1).length },
    { key: "day_gte_3",  label: "Did ≥ 3 days",            count: users.filter((u) => u.daysCompleted >= 3).length },
    { key: "day_gte_5",  label: "Did ≥ 5 days",            count: users.filter((u) => u.daysCompleted >= 5).length },
    { key: "day_all",    label: `Did all ${TRIAL_DAYS} days`, count: users.filter((u) => u.daysCompleted >= TRIAL_DAYS).length },
    { key: "checkin_3",  label: "Answered Day 3 check-in", count: users.filter((u) => u.checkIn3 !== null).length },
    { key: "checkin_6",  label: "Answered Day 6 check-in", count: users.filter((u) => u.checkIn6 !== null).length },
    { key: "converted",  label: "Converted to paid",       count: users.filter((u) => u.converted).length },
    { key: "cancelled",  label: "Cancelled trial",         count: users.filter((u) => u.cancelled).length },
  ];

  // ── Per-day completion (heatmap) ───────────────────────────────
  const perDayCounts: number[] = new Array(TRIAL_DAYS).fill(0);
  for (const u of users) {
    for (let i = 0; i < TRIAL_DAYS; i++) if (u.perDay[i]) perDayCounts[i]++;
  }

  // ── Check-in tallies ────────────────────────────────────────────
  const checkIn3 = emptyCheckIn();
  const checkIn6 = emptyCheckIn();
  for (const u of users) {
    if (u.checkIn3) { checkIn3[u.checkIn3]++; checkIn3.total++; }
    if (u.checkIn6) { checkIn6[u.checkIn6]++; checkIn6.total++; }
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>
          Trial
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
          {total.toLocaleString()} trials started since build 162 (2026-08-18).
          Cancelled bar excludes anyone who cancelled before 2026-08-19 (RC
          webhook didn't record cancellations before that date).
        </p>
      </header>

      <GenderTabs selected={gender} totals={{ all: allTrialsCount, male: genderMale, female: genderFemale }} />

      <FunnelPanel rows={funnel} />
      <PerDayPanel counts={perDayCounts} total={total} />

      <div style={{ display: "grid", gap: 12 }}>
        <CheckInCard day={3} counts={checkIn3} />
        <CheckInCard day={6} counts={checkIn6} />
      </div>

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

// ── Gender tab strip ───────────────────────────────────────────────

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
        marginBottom: 20,
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

// ── Funnel panel (cumulative rows) ─────────────────────────────────

function FunnelPanel({ rows }: { rows: Array<{ key: string; label: string; count: number }> }) {
  const baseline = rows[0].count || 1;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <SectionTitle>Funnel</SectionTitle>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>
        % of {baseline.toLocaleString()} trials that reached each stage.
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r) => {
          const pct = (r.count / baseline) * 100;
          const isNegative = r.key === "cancelled";
          const barColor = isNegative ? "#C03E06" : r.key === "converted" ? "#359033" : "#fff";
          return (
            <div
              key={r.key}
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr 110px",
                alignItems: "center",
                gap: 12,
                padding: "6px 0",
              }}
            >
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
                {r.label}
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
                    background: barColor,
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
                  {r.count.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Per-day heatmap — where do people bail? ────────────────────────

function PerDayPanel({ counts, total }: { counts: number[]; total: number }) {
  const base = total || 1;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <SectionTitle>Per-day completion</SectionTitle>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>
        % of trials that completed each specific day. Order-independent —
        someone can appear on Day 4 without Day 3.
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {counts.map((count, i) => {
          const day = i + 1;
          const pct = (count / base) * 100;
          return (
            <div
              key={day}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 110px",
                alignItems: "center",
                gap: 12,
                padding: "6px 0",
              }}
            >
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
                Day {day}
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

// ── Check-in cards (Day 3, Day 6) — same layout as scalp-check-ins ─

function CheckInCard({ day, counts }: { day: number; counts: CheckInCounts }) {
  const total = counts.total;
  interface Row { key: Answer; label: string; color: string; count: number; pct: number }
  const rows: Row[] = [
    { key: "yes",      label: "Yes — looser",     color: "#359033", count: counts.yes,      pct: 0 },
    { key: "not_sure", label: "Not sure",         color: "#DAA520", count: counts.not_sure, pct: 0 },
    { key: "no",       label: "No — still tight", color: "#C03E06", count: counts.no,       pct: 0 },
  ];
  for (const r of rows) r.pct = total === 0 ? 0 : (r.count / total) * 100;
  rows.sort((a, b) => b.count - a.count);
  const maxCount = rows[0]?.count || 1;

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
        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
          Day {day} check-in
        </div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.55)",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 500,
          }}
        >
          <span style={{ color: "#fff", fontWeight: 600 }}>
            {total.toLocaleString()}
          </span>{" "}
          answered
        </div>
      </div>

      {total === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          No responses yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r) => (
            <div key={r.key} style={{ display: "grid", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    color: "rgba(255,255,255,0.9)",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: r.color,
                      display: "inline-block",
                    }}
                  />
                  <span>{r.label}</span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontVariantNumeric: "tabular-nums",
                    color: "#fff",
                    fontWeight: 500,
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <span>{r.pct.toFixed(1)}%</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>
                    {r.count.toLocaleString()}
                  </span>
                </div>
              </div>
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
                    width: `${Math.max((r.count / maxCount) * 100, r.count > 0 ? 2 : 0)}%`,
                    height: "100%",
                    background: r.color,
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}
