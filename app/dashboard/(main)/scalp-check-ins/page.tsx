// Scalp check-in analytics — how many users answer yes/no/not_sure on
// Days 3, 6, and 13 of the routine. Reads scalp_check_answers directly
// off each user doc (no aggregation collection yet — scans Users once
// per page load, fine at current scale).

import { getFirebaseAdmin } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

const CHECK_IN_DAYS = [3, 6, 13] as const;
type Answer = "yes" | "no" | "not_sure";

interface DayCounts {
  yes: number;
  no: number;
  not_sure: number;
  total: number;
}

interface Segment {
  key: string;
  label: string;
  counts: Record<number, DayCounts>;
  userTotal: number;
}

const EMPTY_COUNTS = (): DayCounts => ({ yes: 0, no: 0, not_sure: 0, total: 0 });

export default async function ScalpCheckInsPage() {
  const { db } = getFirebaseAdmin();

  const [freev2Snap, freeSnap, vipSnap] = await Promise.all([
    db.collection("Users").where("user_type", "==", "freev2").select("scalp_check_answers").get(),
    db.collection("Users").where("user_type", "==", "free").select("scalp_check_answers").get(),
    db.collection("Users").where("user_type", "==", "vip").select("scalp_check_answers").get(),
  ]);

  const segments: Segment[] = [
    { key: "freev2", label: "FreeV2", counts: {}, userTotal: freev2Snap.size },
    { key: "free", label: "Free (legacy)", counts: {}, userTotal: freeSnap.size },
    { key: "vip", label: "VIP", counts: {}, userTotal: vipSnap.size },
  ];
  for (const s of segments) {
    for (const day of CHECK_IN_DAYS) s.counts[day] = EMPTY_COUNTS();
  }

  const tally = (segmentIdx: number, snap: FirebaseFirestore.QuerySnapshot) => {
    for (const doc of snap.docs) {
      const answers = doc.data().scalp_check_answers as Record<string, string> | undefined;
      if (!answers) continue;
      for (const day of CHECK_IN_DAYS) {
        const raw = answers[String(day)];
        if (raw !== "yes" && raw !== "no" && raw !== "not_sure") continue;
        const bucket = segments[segmentIdx].counts[day];
        bucket[raw as Answer]++;
        bucket.total++;
      }
    }
  };
  tally(0, freev2Snap);
  tally(1, freeSnap);
  tally(2, vipSnap);

  const totalSegment: Segment = {
    key: "all",
    label: "All users",
    counts: {},
    userTotal: segments.reduce((sum, s) => sum + s.userTotal, 0),
  };
  for (const day of CHECK_IN_DAYS) {
    const merged = EMPTY_COUNTS();
    for (const s of segments) {
      const c = s.counts[day];
      merged.yes += c.yes;
      merged.no += c.no;
      merged.not_sure += c.not_sure;
      merged.total += c.total;
    }
    totalSegment.counts[day] = merged;
  }

  const displaySegments = [totalSegment, ...segments.filter((s) => s.userTotal > 0)];

  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>
          Scalp check-ins
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
          Day 3 / 6 / 13 “is your scalp starting to get looser?” answers. Day 6 “no” triggers
          the stubborn-scalp intervention (Neck Presses unlocks early). Day 13 “no” / “not sure”
          routes to support.
        </p>
      </header>

      {displaySegments.map((seg) => (
        <section key={seg.key} style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: 0 }}>
              {seg.label}
            </h2>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
              {seg.userTotal.toLocaleString()} users in segment
            </span>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {CHECK_IN_DAYS.map((day) => (
              <DayCard key={day} day={day} counts={seg.counts[day]} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DayCard({ day, counts }: { day: number; counts: DayCounts }) {
  const total = counts.total;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);

  const rows: Array<{ key: Answer; label: string; color: string; count: number }> = [
    { key: "yes", label: "Yes — looser", color: "#359033", count: counts.yes },
    { key: "not_sure", label: "Not sure", color: "#DAA520", count: counts.not_sure },
    { key: "no", label: "No — still tight", color: "#C03E06", count: counts.no },
  ];

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Day {day}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          {total.toLocaleString()} answered
        </div>
      </div>

      {total === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No responses yet.</div>
      ) : (
        <>
          <div style={{
            display: "flex",
            height: 6,
            borderRadius: 3,
            overflow: "hidden",
            marginBottom: 12,
            background: "rgba(255,255,255,0.06)",
          }}>
            {rows.map((r) => (
              <div key={r.key} style={{ width: `${pct(r.count)}%`, background: r.color }} />
            ))}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {rows.map((r) => (
              <div key={r.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: r.color,
                    display: "inline-block",
                  }} />
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>{r.label}</span>
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontVariantNumeric: "tabular-nums" }}>
                  {pct(r.count).toFixed(1)}%
                  <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>
                    {r.count.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
