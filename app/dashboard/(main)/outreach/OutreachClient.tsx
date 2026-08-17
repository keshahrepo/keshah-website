"use client";

import { useEffect, useState } from "react";

type Row = {
  userId: string;
  firstName: string;
  phoneNumber: string;
  phoneDisplay: string;
  signupAgeHours: number;
  referralSource: string;
  selectedGender: string;
  stage: string;
  smsHref: string;
};

type ApiResponse = {
  days: number;
  total_in_window: number;
  rows: Row[];
  message_preview: string;
  generated_at: string;
};

const WINDOW_OPTIONS = [
  { key: 1, label: "Last 24h" },
  { key: 3, label: "Last 3d" },
  { key: 7, label: "Last 7d" },
  { key: 14, label: "Last 14d" },
];

function ageLabel(hrs: number): string {
  if (hrs < 1) return `${Math.round(hrs * 60)}m ago`;
  if (hrs < 24) return `${Math.round(hrs)}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function OutreachClient() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeSent, setIncludeSent] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/outreach?days=${days}&limit=50${includeSent ? "&include_sent=1" : ""}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as ApiResponse;
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days, includeSent]);

  async function markSent(userId: string) {
    setMarkingId(userId);
    try {
      const r = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "mark_sent" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Optimistic remove from current view (unless includeSent)
      if (!includeSent) {
        setData((d) => d ? { ...d, rows: d.rows.filter((x) => x.userId !== userId) } : d);
      } else {
        load();
      }
    } catch (e) {
      alert(`Failed to mark sent: ${e instanceof Error ? e.message : "?"}`);
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div>
      <div style={tabs}>
        {WINDOW_OPTIONS.map((w) => {
          const active = w.key === days;
          return (
            <button key={w.key} onClick={() => setDays(w.key)} style={{ ...tab, ...(active ? tabActive : {}) }}>
              {w.label}
            </button>
          );
        })}
        <label style={includeSentToggle}>
          <input
            type="checkbox"
            checked={includeSent}
            onChange={(e) => setIncludeSent(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Show already-texted
        </label>
      </div>

      {data && (
        <div style={{ marginBottom: 12, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          {data.total_in_window} eligible · showing {data.rows.length}
          {" · updated "}
          {new Date(data.generated_at).toLocaleTimeString()}
        </div>
      )}

      {data && (
        <div style={messageBox}>
          <div style={messageLabel}>Pre-drafted message (Name auto-fills)</div>
          <div style={messageText}>{data.message_preview}</div>
        </div>
      )}

      {error && <div style={errorBox}>Error: {error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && !data && <div style={loadingCell}>Loading…</div>}
        {data?.rows.map((r) => (
          <div key={r.userId} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                  <span style={name}>{r.firstName}</span>
                  <span style={dim}>{r.phoneDisplay}</span>
                </div>
                <div style={meta}>
                  <span>{ageLabel(r.signupAgeHours)}</span>
                  <span style={dotSep}>·</span>
                  <span>{r.referralSource}</span>
                  <span style={dotSep}>·</span>
                  <span>{r.selectedGender}</span>
                </div>
                <div style={stageLabel}>{r.stage}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
                <a href={r.smsHref} style={btnPrimary} target="_self">
                  Text {r.firstName} ↗
                </a>
                <button
                  onClick={() => markSent(r.userId)}
                  disabled={markingId === r.userId}
                  style={btnGhost}
                >
                  {markingId === r.userId ? "…" : "Mark sent"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {data && data.rows.length === 0 && (
          <div style={emptyCell}>
            {includeSent ? "No matching users in this window." : "All caught up — no untexted users in this window."}
          </div>
        )}
      </div>
    </div>
  );
}

const tabs: React.CSSProperties = { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" };
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
const tabActive: React.CSSProperties = { background: "#fff", color: "#000", border: "1px solid #fff" };
const includeSentToggle: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: 12,
  color: "rgba(255,255,255,0.6)",
  display: "flex",
  alignItems: "center",
};
const messageBox: React.CSSProperties = {
  background: "rgba(120, 200, 255, 0.06)",
  border: "1px solid rgba(120, 200, 255, 0.2)",
  borderRadius: 12,
  padding: 14,
  marginBottom: 18,
};
const messageLabel: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 8,
};
const messageText: React.CSSProperties = {
  fontSize: 14,
  color: "rgba(255,255,255,0.9)",
  lineHeight: 1.55,
  fontFamily: "ui-monospace, monospace",
  whiteSpace: "pre-wrap",
};
const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 14,
};
const name: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "#fff" };
const dim: React.CSSProperties = { fontSize: 13, color: "rgba(255,255,255,0.5)", fontVariantNumeric: "tabular-nums" };
const meta: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.55)",
  display: "flex",
  gap: 6,
  alignItems: "center",
  marginBottom: 4,
};
const dotSep: React.CSSProperties = { color: "rgba(255,255,255,0.25)" };
const stageLabel: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(180, 220, 180, 0.8)",
  fontWeight: 500,
};
const btnPrimary: React.CSSProperties = {
  background: "#3b82f6",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  textAlign: "center",
  whiteSpace: "nowrap",
};
const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "rgba(255,255,255,0.65)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};
const loadingCell: React.CSSProperties = {
  padding: 32,
  textAlign: "center",
  color: "rgba(255,255,255,0.5)",
};
const emptyCell: React.CSSProperties = {
  padding: 32,
  textAlign: "center",
  color: "rgba(255,255,255,0.5)",
  border: "1px dashed rgba(255,255,255,0.15)",
  borderRadius: 12,
};
const errorBox: React.CSSProperties = {
  background: "rgba(255,100,100,0.1)",
  border: "1px solid rgba(255,100,100,0.3)",
  borderRadius: 8,
  padding: 12,
  color: "#ff9999",
  fontSize: 13,
  marginBottom: 12,
};
