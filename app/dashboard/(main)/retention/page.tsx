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
        {(() => {
          // Day 14 is the pipeline's marquee retention metric — first
          // week + one full extra week past trial billing. Anything
          // moving p6-style dead-zone plans should show up here.
          const d14 = data?.milestones?.find((m) => m.day === 14);
          const d14Eligible = d14?.eligible ?? 0;
          return (
            <MetricCard
              label="Day 14 retention"
              value={loading ? "…" : d14Eligible > 0 ? `${d14?.pct ?? 0}%` : "—"}
              subtitle={d14Eligible > 0 ? `${d14?.reached}/${d14Eligible} eligible` : "cohort too small"}
            />
          );
        })()}
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

      <DayCheckInCard day={13} title="Day 13 scalp check-in" subtitle='Post-trial engagement signal — "no" / "not sure" routes to support.' />
    </div>
  );
}

type Answer = "yes" | "no" | "not_sure";
interface CheckInApiResponse { ok: boolean; day: number; yes: number; no: number; not_sure: number; total: number }

function DayCheckInCard({ day, title, subtitle }: { day: number; title: string; subtitle: string }) {
  const [data, setData] = useState<CheckInApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/day-check-in?day=${day}`)
      .then((r) => r.json())
      .then((json: CheckInApiResponse) => { if (json.ok) setData(json); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [day]);

  const total = data?.total ?? 0;
  interface Row { key: Answer; label: string; color: string; count: number; pct: number }
  const rows: Row[] = [
    { key: "yes",      label: "Yes — looser",     color: "#359033", count: data?.yes ?? 0,      pct: 0 },
    { key: "not_sure", label: "Not sure",         color: "#DAA520", count: data?.not_sure ?? 0, pct: 0 },
    { key: "no",       label: "No — still tight", color: "#C03E06", count: data?.no ?? 0,       pct: 0 },
  ];
  for (const r of rows) r.pct = total === 0 ? 0 : (r.count / total) * 100;
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const maxCount = sorted[0]?.count || 1;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 18,
        marginTop: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
          gap: 12,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{title}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
          {loading ? "…" : (<><span style={{ color: "#fff", fontWeight: 600 }}>{total.toLocaleString()}</span> answered</>)}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>{subtitle}</div>

      {loading ? null : total === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No responses yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {sorted.map((r) => (
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
