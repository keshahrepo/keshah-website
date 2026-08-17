// Trials dashboard.
//
// Two sources of trial data:
//   - Web trials (Razorpay /tryfree flow) — Firestore Users docs where
//     trial_status="active" + signup_source="web_funnel". We own the writes.
//   - App trials (RevenueCat) — pulled live from RC v2 metrics overview.
//     The mobile app uses pure RC purchase flow with no Firestore mirror, so
//     RC is the source of truth.

import { getFirebaseAdmin } from "@/lib/firebase-admin";

// Render at request time — Firestore reads can't run at build time.
export const dynamic = "force-dynamic";

interface WebTrial {
  uid: string;
  firstName: string | null;
  phone: string | null;
  startedAt: number | null;
  endsAt: number | null;
  status: "active" | "converted" | "cancelled";
}

const DAY_MS = 86_400_000;

async function loadWebTrials(): Promise<{
  trials: WebTrial[];
  active: number;
  converted: number;
  cancelled: number;
  startedToday: number;
  startedThisWeek: number;
}> {
  const { db } = getFirebaseAdmin();

  // Get every doc that has a trial_started_at. Single-field query avoids the
  // composite index requirement. Filter by status in code below.
  const snap = await db
    .collection("Users")
    .orderBy("trial_started_at", "desc")
    .limit(500)
    .get();

  const now = Date.now();
  const todayStart = now - DAY_MS;
  const weekStart = now - 7 * DAY_MS;

  const trials: WebTrial[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const startedAtRaw = data.trial_started_at as
      | { _seconds?: number; seconds?: number; toMillis?: () => number }
      | undefined;
    const endsAtRaw = data.trial_ends_at as
      | { _seconds?: number; seconds?: number; toMillis?: () => number }
      | undefined;
    const startedAt = startedAtRaw?.toMillis
      ? startedAtRaw.toMillis()
      : (startedAtRaw?._seconds ?? startedAtRaw?.seconds ?? 0) * 1000;
    const endsAt = endsAtRaw?.toMillis
      ? endsAtRaw.toMillis()
      : (endsAtRaw?._seconds ?? endsAtRaw?.seconds ?? 0) * 1000;

    return {
      uid: d.id,
      firstName: (data.first_name as string | null | undefined) ?? null,
      phone:
        (data.phone_number as { complete_number?: string } | undefined)
          ?.complete_number ?? null,
      startedAt: startedAt || null,
      endsAt: endsAt || null,
      status: (data.trial_status as "active" | "converted" | "cancelled") ?? "active",
    };
  });

  let active = 0;
  let converted = 0;
  let cancelled = 0;
  let startedToday = 0;
  let startedThisWeek = 0;

  for (const t of trials) {
    if (t.status === "active") active++;
    else if (t.status === "converted") converted++;
    else if (t.status === "cancelled") cancelled++;
    if (t.startedAt && t.startedAt >= todayStart) startedToday++;
    if (t.startedAt && t.startedAt >= weekStart) startedThisWeek++;
  }

  return { trials, active, converted, cancelled, startedToday, startedThisWeek };
}

interface RCOverview {
  activeTrials: number | null;
  activeSubscriptions: number | null;
  raw: unknown;
}

async function loadAppTrials(): Promise<RCOverview> {
  const apiKey = process.env.REVENUECAT_API_KEY;
  if (!apiKey) {
    return { activeTrials: null, activeSubscriptions: null, raw: null };
  }
  try {
    const res = await fetch(
      "https://api.revenuecat.com/v2/projects/app4e0f50f36b/metrics/overview",
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) {
      // Fallback to v1
      const v1 = await fetch(
        "https://api.revenuecat.com/v1/developers/me/overview",
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      const json = await v1.json().catch(() => null);
      return extractOverview(json);
    }
    const json = await res.json();
    return extractOverview(json);
  } catch {
    return { activeTrials: null, activeSubscriptions: null, raw: null };
  }
}

function extractOverview(json: unknown): RCOverview {
  if (!json || typeof json !== "object") {
    return { activeTrials: null, activeSubscriptions: null, raw: json };
  }
  const obj = json as Record<string, unknown>;
  // v2 shape: metrics array with id like "active_trials"
  const metrics = obj.metrics as Array<{ id?: string; value?: number }> | undefined;
  let activeTrials: number | null = null;
  let activeSubscriptions: number | null = null;
  if (Array.isArray(metrics)) {
    for (const m of metrics) {
      if (m.id === "active_trials") activeTrials = m.value ?? null;
      if (m.id === "active_subscriptions") activeSubscriptions = m.value ?? null;
    }
  }
  // v1 shape fallback
  if (activeTrials == null && typeof obj.active_trials === "number") {
    activeTrials = obj.active_trials;
  }
  if (activeSubscriptions == null && typeof obj.active_subscriptions === "number") {
    activeSubscriptions = obj.active_subscriptions;
  }
  return { activeTrials, activeSubscriptions, raw: json };
}

function fmtDate(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusColor(s: string): string {
  if (s === "active") return "#4caf50";
  if (s === "converted") return "#4fc3f7";
  return "#ff8a65";
}

export default async function TrialsPage() {
  const [web, app] = await Promise.all([loadWebTrials(), loadAppTrials()]);

  const conversionRate =
    web.converted + web.cancelled > 0
      ? (web.converted / (web.converted + web.cancelled)) * 100
      : null;

  return (
    <div style={{ padding: "0 0 48px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
          Trials
        </h1>
        <div style={{ color: "#888", fontSize: 13 }}>
          Web trials from <code style={codeStyle}>/tryfree</code> · App trials from RevenueCat
        </div>
      </div>

      {/* Web trials section */}
      <h2 style={sectionH}>Web (Razorpay · /tryfree)</h2>
      <div style={cardGrid}>
        <Card label="Active" value={web.active.toString()} accent="#4caf50" />
        <Card label="Converted" value={web.converted.toString()} accent="#4fc3f7" />
        <Card label="Cancelled" value={web.cancelled.toString()} accent="#ff8a65" />
        <Card
          label="Conversion"
          value={conversionRate != null ? `${conversionRate.toFixed(0)}%` : "—"}
          sub={`${web.converted} of ${web.converted + web.cancelled} resolved`}
        />
        <Card label="Started today" value={web.startedToday.toString()} />
        <Card label="Started this week" value={web.startedThisWeek.toString()} />
      </div>

      {/* App trials section */}
      <h2 style={{ ...sectionH, marginTop: 32 }}>App (RevenueCat)</h2>
      <div style={cardGrid}>
        <Card
          label="Active trials"
          value={app.activeTrials != null ? app.activeTrials.toString() : "—"}
          sub={app.activeTrials == null ? "RC API unavailable" : "from RC overview"}
        />
        <Card
          label="Active subscriptions"
          value={app.activeSubscriptions != null ? app.activeSubscriptions.toString() : "—"}
          sub="paid + trialing"
        />
      </div>

      {/* Web trials list */}
      <h2 style={{ ...sectionH, marginTop: 32 }}>Recent web trials</h2>
      <div style={{ background: "#111", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", color: "#fff", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#1a1a1a", textAlign: "left" }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Phone</th>
              <th style={thStyle}>Started</th>
              <th style={thStyle}>Ends</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {web.trials.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{ ...tdStyle, textAlign: "center", color: "#666", padding: "24px 16px" }}
                >
                  No trials yet.
                </td>
              </tr>
            )}
            {web.trials.map((t) => (
              <tr key={t.uid} style={{ borderTop: "1px solid #222" }}>
                <td style={tdStyle}>{t.firstName ?? "—"}</td>
                <td style={{ ...tdStyle, color: "#aaa", fontFamily: "monospace", fontSize: 12 }}>
                  {t.phone ?? "—"}
                </td>
                <td style={tdStyle}>{fmtDate(t.startedAt)}</td>
                <td style={tdStyle}>{fmtDate(t.endsAt)}</td>
                <td style={tdStyle}>
                  <span style={{ color: statusColor(t.status), fontSize: 12, fontWeight: 600 }}>
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div style={{ background: "#111", borderRadius: 8, padding: 16 }}>
      <div style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>{label}</div>
      <div style={{ color: accent ?? "#fff", fontSize: 24, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: "#666", fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const sectionH: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "rgba(255,255,255,0.5)",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 12,
};
const cardGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};
const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 12,
  color: "#888",
  fontWeight: 500,
};
const tdStyle: React.CSSProperties = { padding: "12px 16px", fontSize: 14 };
const codeStyle: React.CSSProperties = {
  background: "#1a1a1a",
  padding: "2px 6px",
  borderRadius: 4,
  fontSize: 12,
  color: "#aaa",
};
