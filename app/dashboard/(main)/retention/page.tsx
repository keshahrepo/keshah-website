"use client";

import { useCallback, useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface Milestone {
  day: number;
  eligible: number;
  reached: number;
  pct: number;
}

interface RetentionData {
  ok: boolean;
  from: string;
  to: string;
  cohort_size: number;
  total_tagged: number;
  engaged: number;
  milestones: Milestone[];
}

const PAID_LAUNCH = "2026-02-09";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  { label: "Since launch", from: PAID_LAUNCH, to: todayStr() },
  { label: "Last 30 days", from: daysAgo(30), to: todayStr() },
  { label: "Last 14 days", from: daysAgo(14), to: todayStr() },
  { label: "Last 7 days", from: daysAgo(7), to: todayStr() },
];

export default function RetentionPage() {
  const [data, setData] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(PAID_LAUNCH);
  const [to, setTo] = useState(todayStr());

  const fetchData = useCallback(async (f: string, t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/retention?from=${f}&to=${t}`);
      const json = (await res.json()) as RetentionData;
      if (json.ok) setData(json);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData(from, to);
  }, [from, to, fetchData]);

  const applyPreset = (p: { from: string; to: string }) => {
    setFrom(p.from);
    setTo(p.to);
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>
          In-App Retention
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          Time-adjusted day-by-day completion rates for engaged paid users.
          Only counts days with non-empty progress (actual exercise completion).
        </p>
      </div>

      {/* Date filter bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          marginBottom: 20,
          padding: 16,
          background: "rgba(255,255,255,0.03)",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              style={{
                padding: "6px 12px",
                background: from === p.from && to === p.to ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                color: from === p.from && to === p.to ? "#fff" : "rgba(255,255,255,0.5)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <MetricCard
          label="Cohort size"
          value={loading ? "…" : String(data?.cohort_size ?? 0)}
          subtitle={data ? `${data.engaged} engaged total` : ""}
        />
        <MetricCard
          label="Date range"
          value={loading ? "…" : `${data?.from ?? from}`}
          subtitle={`to ${data?.to ?? to}`}
        />
      </div>

      {/* Day milestones */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {(data?.milestones ?? []).filter((m) => m.eligible > 0).map((m) => (
          <MetricCard
            key={m.day}
            label={`Day ${m.day}`}
            value={`${m.pct}%`}
            subtitle={`${m.reached}/${m.eligible} eligible`}
          />
        ))}
      </div>

      {(data?.milestones?.filter((m) => m.eligible > 0).length ?? 0) === 0 && !loading && (
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: "40px 24px",
            textAlign: "center",
          }}
        >
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            No retention data for this date range.
          </p>
        </div>
      )}
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: 11,
        color: "rgba(255,255,255,0.4)",
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      <span style={{ marginBottom: 4 }}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6,
          color: "#fff",
          fontSize: 13,
          padding: "6px 10px",
          fontFamily: "inherit",
        }}
      />
    </label>
  );
}
