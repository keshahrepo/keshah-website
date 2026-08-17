"use client";

import { useEffect, useState } from "react";

type Row = {
  source: string;
  signups: number;
  pctOfTotal: number;
  trialStarts: number;
  trialStartPct: number;
  paid: number;
  paidPct: number;
};

type ApiResponse = {
  window: string;
  total: number;
  rows: Row[];
  generated_at: string;
};

const WINDOWS = [
  { key: "24h", label: "Last 24h" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All time" },
] as const;

type WindowKey = (typeof WINDOWS)[number]["key"];

export default function AttributionClient() {
  const [windowKey, setWindowKey] = useState<WindowKey>("7d");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/attribution?window=${windowKey}`, { signal: ac.signal })
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

      {error && (
        <div style={errorBox}>Error: {error}</div>
      )}

      {data && (
        <div style={{ marginBottom: 12, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          {data.total.toLocaleString()} total signups
          {" · "}
          updated {new Date(data.generated_at).toLocaleTimeString()}
        </div>
      )}

      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Source</th>
              <th style={thRight}>New customers</th>
              <th style={thRight}>% of all</th>
              <th style={thRight}>Trial starts</th>
              <th style={thRight}>Trial start %</th>
              <th style={thRight}>Paid</th>
              <th style={thRight}>Paid %</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr><td colSpan={7} style={loadingCell}>Loading…</td></tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.source}>
                <td style={td}>{r.source}</td>
                <td style={tdRight}>{r.signups.toLocaleString()}</td>
                <td style={tdRightDim}>{fmtPct(r.pctOfTotal)}</td>
                <td style={tdRight}>{r.trialStarts.toLocaleString()}</td>
                <td style={tdRightDim}>{fmtPct(r.trialStartPct)}</td>
                <td style={tdRight}>{r.paid.toLocaleString()}</td>
                <td style={tdRightDim}>{fmtPct(r.paidPct)}</td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr><td colSpan={7} style={loadingCell}>No signups in this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={footnote}>
        <strong>Signals:</strong>{" "}
        <code style={code}>signups</code> = User docs created in window ·{" "}
        <code style={code}>trial starts</code> = converted_at or start_date set ·{" "}
        <code style={code}>paid</code> = first_paid_at or paid_at set (RC webhook)
      </div>
    </div>
  );
}

const tabs: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 16,
};
const tab: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.6)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};
const tabActive: React.CSSProperties = {
  background: "#fff",
  color: "#000",
  border: "1px solid #fff",
};
const tableWrap: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  overflow: "hidden",
};
const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "rgba(255,255,255,0.5)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.02)",
};
const thRight: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = {
  padding: "12px 16px",
  color: "rgba(255,255,255,0.85)",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};
const tdRight: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdRightDim: React.CSSProperties = { ...tdRight, color: "rgba(255,255,255,0.55)" };
const loadingCell: React.CSSProperties = {
  padding: "32px",
  textAlign: "center",
  color: "rgba(255,255,255,0.5)",
};
const errorBox: React.CSSProperties = {
  background: "rgba(255, 100, 100, 0.1)",
  border: "1px solid rgba(255, 100, 100, 0.3)",
  borderRadius: 8,
  padding: 12,
  color: "#ff9999",
  fontSize: 13,
  marginBottom: 12,
};
const footnote: React.CSSProperties = {
  marginTop: 16,
  fontSize: 11,
  color: "rgba(255,255,255,0.4)",
  lineHeight: 1.6,
};
const code: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  padding: "1px 6px",
  borderRadius: 4,
  fontFamily: "ui-monospace, monospace",
  fontSize: 11,
};
