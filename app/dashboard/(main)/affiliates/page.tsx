// Affiliate commission dashboard.
//
// Reads Firestore for users with `referral_source == {slug}`, aggregates
// paid conversions by currency + plan, and shows commission owed at the
// configured rate. Access controlled by the existing /dashboard middleware
// (JWT cookie).

import { getFirebaseAdmin } from "@/lib/firebase-admin";

const PLAN_USD: Record<string, number> = { monthly: 29, threeMonth: 57 };
const PLAN_INR: Record<string, number> = { monthly: 499, threeMonth: 999 };
const COMMISSION_RATE = 0.2;

interface AffiliateUser {
  uid: string;
  email: string | null;
  plan: "monthly" | "threeMonth" | null;
  provider: "razorpay" | "rc_billing" | null;
  paidAt: number | null;
  cancelled: boolean;
}

async function loadAffiliate(slug: string): Promise<{
  users: AffiliateUser[];
  usd: { monthly: number; threeMonth: number; revenue: number };
  inr: { monthly: number; threeMonth: number; revenue: number };
}> {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection("Users")
    .where("referral_source", "==", slug)
    .get();

  const users: AffiliateUser[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const plan =
      (data.plan as "monthly" | "threeMonth" | undefined) ??
      // Back-fill for docs written before the unified `plan` field landed.
      (data.razorpay_plan as "monthly" | "threeMonth" | undefined) ??
      null;
    const provider =
      (data.payment_provider as "razorpay" | "rc_billing" | undefined) ??
      (data.razorpay_subscription_id ? "razorpay" : "rc_billing");
    const paidAtRaw = (data.paid_at ?? data.created_at) as
      | { _seconds?: number; seconds?: number }
      | undefined;
    const paidAt = paidAtRaw?._seconds ?? paidAtRaw?.seconds ?? null;
    return {
      uid: d.id,
      email: (data.email as string | null | undefined) ?? null,
      plan,
      provider,
      paidAt,
      cancelled: data.razorpay_subscription_status === "cancelled",
    };
  });

  const usd = { monthly: 0, threeMonth: 0, revenue: 0 };
  const inr = { monthly: 0, threeMonth: 0, revenue: 0 };
  for (const u of users) {
    if (!u.plan) continue;
    if (u.provider === "razorpay") {
      inr[u.plan]++;
      inr.revenue += PLAN_INR[u.plan];
    } else {
      usd[u.plan]++;
      usd.revenue += PLAN_USD[u.plan];
    }
  }

  users.sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0));
  return { users, usd, inr };
}

function fmtDate(seconds: number | null): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function AffiliatesPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug = "chad" } = await searchParams;
  const data = await loadAffiliate(slug);

  const usdCommission = data.usd.revenue * COMMISSION_RATE;
  const inrCommission = data.inr.revenue * COMMISSION_RATE;

  return (
    <div style={{ padding: "0 0 48px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
          Affiliate · {slug}
        </h1>
        <div style={{ color: "#888", fontSize: 13 }}>
          Users with <code style={codeStyle}>referral_source == &quot;{slug}&quot;</code>
        </div>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 32,
        }}
      >
        <Card label="Paid conversions" value={data.users.length.toString()} />
        <Card
          label="US revenue"
          value={`$${data.usd.revenue}`}
          sub={`${data.usd.monthly}× Monthly · ${data.usd.threeMonth}× 3-mo`}
        />
        <Card
          label="India revenue"
          value={`₹${data.inr.revenue}`}
          sub={`${data.inr.monthly}× Monthly · ${data.inr.threeMonth}× 3-mo`}
        />
        <Card
          label={`Commission @ ${(COMMISSION_RATE * 100).toFixed(0)}%`}
          value={`$${usdCommission.toFixed(2)}`}
          sub={`+ ₹${inrCommission.toFixed(0)}`}
        />
      </div>

      {/* Users table */}
      <div style={{ background: "#111", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", color: "#fff", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#1a1a1a", textAlign: "left" }}>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Plan</th>
              <th style={thStyle}>Provider</th>
              <th style={thStyle}>Paid at</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.users.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{ ...tdStyle, textAlign: "center", color: "#666", padding: "24px 16px" }}
                >
                  No users yet for this affiliate.
                </td>
              </tr>
            )}
            {data.users.map((u) => (
              <tr key={u.uid} style={{ borderTop: "1px solid #222" }}>
                <td style={tdStyle}>{u.email ?? u.uid}</td>
                <td style={tdStyle}>
                  {u.plan === "threeMonth" ? "3-month" : u.plan ?? "—"}
                </td>
                <td style={tdStyle}>
                  {u.provider === "razorpay"
                    ? "Razorpay (India)"
                    : u.provider === "rc_billing"
                    ? "RC Billing (US)"
                    : "—"}
                </td>
                <td style={tdStyle}>{fmtDate(u.paidAt)}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      color: u.cancelled ? "#ff8a65" : "#4caf50",
                      fontSize: 12,
                    }}
                  >
                    {u.cancelled ? "Cancelled" : "Active"}
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
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div style={{ background: "#111", borderRadius: 8, padding: 16 }}>
      <div style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>{label}</div>
      <div style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: "#666", fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

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
