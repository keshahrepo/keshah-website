"use client";

import { useEffect, useState } from "react";

type ChannelRow = {
  channel: string;
  sends: number;
  deliveries: number;
  opens: number;
  clicks: number;
  conversions: number;
  revenue_usd: number;
  open_rate: number;
  click_rate: number;
  conversion_rate: number;
};

type DayRow = {
  day: number;
  conversions: number;
  revenue_usd: number;
};

type ApiResponse = {
  window: string;
  pool: {
    total_eligible: number;
    unsub_bounced_complained: number;
    paid: number;
    sendable: number;
  };
  channels: ChannelRow[];
  per_day_conversions: DayRow[];
  totals: {
    sends: number;
    deliveries: number;
    opens: number;
    clicks: number;
    conversions: number;
    revenue_usd: number;
  };
  assumptions: { blended_arpu_usd: number; note: string };
  generated_at: string;
};

const WINDOWS = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
] as const;

type WindowKey = (typeof WINDOWS)[number]["key"];

export default function NurtureClient() {
  const [windowKey, setWindowKey] = useState<WindowKey>("30d");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/nurture-attribution?window=${windowKey}`, { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: ApiResponse) => setData(j))
      .catch((e) => {
        if (e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [windowKey]);

  const fmtPct = (p: number) => (p === 0 ? "—" : `${(p * 100).toFixed(1)}%`);
  const fmtNum = (n: number) => n.toLocaleString();
  const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <div>
      <div style={tabs}>
        {WINDOWS.map((w) => {
          const active = w.key === windowKey;
          return (
            <button
              key={w.key}
              onClick={() => setWindowKey(w.key)}
              style={{ ...tab, ...(active ? tabActive : {}) }}
            >
              {w.label}
            </button>
          );
        })}
      </div>

      {loading && <div style={hint}>Loading…</div>}
      {error && <div style={{ ...hint, color: "#f87171" }}>Error: {error}</div>}

      {data && (
        <>
          <div style={cardsGrid}>
            <StatCard label="Pool" value={fmtNum(data.pool.total_eligible)} sub="in nurture funnel" />
            <StatCard label="Sendable" value={fmtNum(data.pool.sendable)} sub="after paid/unsub/bounce" />
            <StatCard label="Paid" value={fmtNum(data.pool.paid)} sub="in this window" />
            <StatCard label="Emails sent" value={fmtNum(data.totals.sends)} />
            <StatCard label="Opens" value={fmtNum(data.totals.opens)} sub={fmtPct(data.totals.deliveries > 0 ? data.totals.opens / data.totals.deliveries : 0) + " open rate"} />
            <StatCard label="Clicks" value={fmtNum(data.totals.clicks)} sub={fmtPct(data.totals.deliveries > 0 ? data.totals.clicks / data.totals.deliveries : 0) + " click rate"} />
            <StatCard label="Conversions" value={fmtNum(data.totals.conversions)} sub="attributed to nurture" />
            <StatCard label="Revenue" value={fmtMoney(data.totals.revenue_usd)} sub={`est. @ $${data.assumptions.blended_arpu_usd} blended ARPU`} />
          </div>

          <h2 style={sectionH}>Per channel</h2>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Channel</th>
                  <th style={thNum}>Sends</th>
                  <th style={thNum}>Delivered</th>
                  <th style={thNum}>Opens</th>
                  <th style={thNum}>Clicks</th>
                  <th style={thNum}>Open rate</th>
                  <th style={thNum}>Click rate</th>
                  <th style={thNum}>Conversions</th>
                  <th style={thNum}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.channels.filter((c) => c.sends > 0 || c.conversions > 0).map((c) => (
                  <tr key={c.channel}>
                    <td style={td}>{c.channel}</td>
                    <td style={tdNum}>{fmtNum(c.sends)}</td>
                    <td style={tdNum}>{fmtNum(c.deliveries)}</td>
                    <td style={tdNum}>{fmtNum(c.opens)}</td>
                    <td style={tdNum}>{fmtNum(c.clicks)}</td>
                    <td style={tdNum}>{fmtPct(c.open_rate)}</td>
                    <td style={tdNum}>{fmtPct(c.click_rate)}</td>
                    <td style={tdNum}>{fmtNum(c.conversions)}</td>
                    <td style={tdNum}>{fmtMoney(c.revenue_usd)}</td>
                  </tr>
                ))}
                {data.channels.every((c) => c.sends === 0 && c.conversions === 0) && (
                  <tr>
                    <td colSpan={9} style={{ ...td, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
                      No data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data.per_day_conversions.length > 0 && (
            <>
              <h2 style={sectionH}>Conversions by nurture day</h2>
              <div style={tableWrap}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Day of drip</th>
                      <th style={thNum}>Conversions</th>
                      <th style={thNum}>Est. revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.per_day_conversions.map((d) => (
                      <tr key={d.day}>
                        <td style={td}>Day {d.day}</td>
                        <td style={tdNum}>{fmtNum(d.conversions)}</td>
                        <td style={tdNum}>{fmtMoney(d.revenue_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <p style={{ marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
            {data.assumptions.note} Generated {new Date(data.generated_at).toLocaleString()}.
          </p>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "rgba(255,255,255,0.5)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: "#fff", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const tabs: React.CSSProperties = { display: "flex", gap: 8, marginBottom: 20 };
const tab: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 8, background: "transparent",
  color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.15)",
  fontSize: 13, cursor: "pointer",
};
const tabActive: React.CSSProperties = { background: "#fff", color: "#000", borderColor: "#fff" };
const hint: React.CSSProperties = { color: "rgba(255,255,255,0.5)", fontSize: 13, padding: 12 };
const cardsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 24,
};
const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10, padding: 14,
};
const sectionH: React.CSSProperties = { fontSize: 15, color: "#fff", margin: "20px 0 10px", fontWeight: 600 };
const tableWrap: React.CSSProperties = { overflowX: "auto", background: "rgba(255,255,255,0.03)", borderRadius: 10 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: React.CSSProperties = { textAlign: "left", padding: "10px 14px", color: "rgba(255,255,255,0.5)", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.08)" };
const thNum: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "10px 14px", color: "#fff", borderBottom: "1px solid rgba(255,255,255,0.04)" };
const tdNum: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
