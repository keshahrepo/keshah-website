"use client";

import { useCallback, useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface MovementRow {
  total: number;
  looser: number;
  noChange: number;
  tighter: number;
}

interface AvgSlot { avg: number; n: number }

interface Data {
  ok: boolean;
  from: string;
  to: string;
  tier: string;
  cohortSize: number;
  movement: Record<string, MovementRow>;
  headline: { eligible: number; loosening: number; pct: number };
  avgTrend: {
    day0: AvgSlot;
    day3: AvgSlot;
    day6: AvgSlot;
    day13: AvgSlot;
  };
  thesis: {
    looser: { cohort: number; paid: number; pct: number };
    noChange: { cohort: number; paid: number; pct: number };
  };
  completion: Record<string, { eligible: number; completed: number; pct: number }>;
  stubborn: { count: number; total: number; pct: number };
  stopPlus: { day13NoChange: number; accepted: number; pct: number };
}

const P18_LAUNCH = "2026-09-02";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const PRESETS = [
  { label: "Since launch", from: P18_LAUNCH, to: todayStr() },
  { label: "Last 30 days", from: daysAgo(30), to: todayStr() },
  { label: "Last 14 days", from: daysAgo(14), to: todayStr() },
  { label: "Last 7 days", from: daysAgo(7), to: todayStr() },
];
const TIERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "tier1", label: "Tier 1" },
  { key: "tier2", label: "Tier 2" },
];

export default function ScalpCheckInsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(P18_LAUNCH);
  const [to, setTo] = useState(todayStr());
  const [tier, setTier] = useState("all");

  const fetchData = useCallback(async (f: string, t: string, tr: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/scalp-check-ins?from=${f}&to=${t}&tier=${tr}`);
      const json = (await res.json()) as Data;
      if (json.ok) setData(json);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData(from, to, tier);
  }, [from, to, tier, fetchData]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>
          Scalp check-ins
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          Measured pinch-rating signal from the Day 3 / Day 6 / Day 13 check-ins (p18).
          Compares today&apos;s slider reading against the Day 0 baseline.
          <br />
          <strong style={{ color: "rgba(255,255,255,0.55)" }}>Looser</strong> = today &lt; Day 0.{" "}
          <strong style={{ color: "rgba(255,255,255,0.55)" }}>Tighter</strong> is a noise/quality flag,
          not a real signal.
        </p>
      </div>

      {/* Date + tier bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 20, padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {TIERS.map((t) => (
            <button key={t.key} onClick={() => setTier(t.key)} style={pillStyle(tier === t.key)}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to); }} style={pillStyle(from === p.from && to === p.to)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Headline strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        <MetricCard
          label="% loosening by Day 6"
          value={loading ? "…" : (data && data.headline.eligible > 0 ? `${Math.round(data.headline.pct)}%` : "—")}
          subtitle={data ? `${data.headline.loosening} of ${data.headline.eligible} eligible` : ""}
        />
        <MetricCard
          label="Cohort size"
          value={loading ? "…" : String(data?.cohortSize ?? 0)}
          subtitle="FreeV2 stoppage with baseline"
        />
        <MetricCard
          label="Stubborn scalp"
          value={loading ? "…" : (data && data.stubborn.total > 0 ? `${Math.round(data.stubborn.pct)}%` : "—")}
          subtitle={data ? `${data.stubborn.count} of ${data.stubborn.total}` : ""}
        />
      </div>

      {/* Card 1: Movement table */}
      <SectionHeader title="Rating movement by check-in" hint="For each day, split against Day 0 baseline (n = users who completed that check-in)." />
      <div style={cardStyle()}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle()}></th>
              <th style={thStyle()}>Looser</th>
              <th style={thStyle()}>No change</th>
              <th style={thStyle()}>Tighter</th>
              <th style={thStyle()}>n</th>
            </tr>
          </thead>
          <tbody>
            {[3, 6, 13].map((d) => {
              const row = data?.movement?.[String(d)];
              return (
                <tr key={d}>
                  <td style={rowLabelStyle()}>Day {d}</td>
                  <td style={cellStyle("#5AB758")}>{fmtPct(row?.looser, row?.total)}</td>
                  <td style={cellStyle("rgba(255,255,255,0.7)")}>{fmtPct(row?.noChange, row?.total)}</td>
                  <td style={cellStyle("rgba(255,255,255,0.4)")}>{fmtPct(row?.tighter, row?.total)}</td>
                  <td style={{ ...cellStyle("rgba(255,255,255,0.5)"), fontSize: 11 }}>{row?.total ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Card 2: Average rating trend */}
      <SectionHeader title="Average rating trend" hint="Falling = cohort loosening. Cleaner than the buckets for spotting direction." />
      <div style={cardStyle()}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {(["day0", "day3", "day6", "day13"] as const).map((k, i) => {
            const label = ["Day 0", "Day 3", "Day 6", "Day 13"][i];
            const slot = data?.avgTrend?.[k];
            return (
              <div key={k} style={{ padding: 14, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "rgba(255,255,255,0.5)" }}>{label}</div>
                <div style={{ fontSize: 26, fontWeight: 600, color: "#fff", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                  {loading ? "…" : (slot && slot.n > 0 ? slot.avg.toFixed(2) : "—")}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                  {slot?.n ? `n=${slot.n}` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Card 3: Thesis check */}
      <SectionHeader title="Thesis check — trial → paid by rater cohort" hint="Loosening detectors vs no-change raters. If detectors pay more, the belief-instrument hypothesis holds." />
      <div style={cardStyle()}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { key: "looser" as const, label: "Looser raters", color: "#5AB758" },
            { key: "noChange" as const, label: "No-change raters", color: "rgba(255,255,255,0.7)" },
          ].map(({ key, label, color }) => {
            const t = data?.thesis?.[key];
            return (
              <div key={key} style={{ padding: 16, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "rgba(255,255,255,0.5)" }}>{label}</div>
                <div style={{ fontSize: 30, fontWeight: 600, color, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                  {loading ? "…" : (t && t.cohort > 0 ? `${t.pct.toFixed(1)}%` : "—")}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                  {t ? `${t.paid} paid of ${t.cohort}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Card 4: Supporting */}
      <SectionHeader title="Supporting" hint="Check-in completion rates + STOP+ opt-in signal." />
      <div style={cardStyle()}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[3, 6, 13].map((d) => {
            const row = data?.completion?.[String(d)];
            return (
              <div key={d} style={{ padding: 12, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "rgba(255,255,255,0.5)" }}>Day {d} completion</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: "#fff", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                  {loading ? "…" : (row && row.eligible > 0 ? `${Math.round(row.pct)}%` : "—")}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                  {row ? `${row.completed}/${row.eligible} eligible` : ""}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 16, padding: 14, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "rgba(255,255,255,0.5)" }}>Day 13 no-change → Start Stop+ tap rate</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#fff", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
            {loading ? "…" : (data && data.stopPlus.day13NoChange > 0 ? `${Math.round(data.stopPlus.pct)}%` : "—")}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {data ? `${data.stopPlus.accepted} accepted of ${data.stopPlus.day13NoChange} shown the CTA` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Local UI helpers ──────────────────────────────────────────────
function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ marginTop: 32, marginBottom: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{hint}</div>
    </div>
  );
}
function cardStyle(): React.CSSProperties {
  return { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16 };
}
function thStyle(): React.CSSProperties {
  return { textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "rgba(255,255,255,0.45)", borderBottom: "1px solid rgba(255,255,255,0.08)" };
}
function rowLabelStyle(): React.CSSProperties {
  return { padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)", borderBottom: "1px solid rgba(255,255,255,0.04)" };
}
function cellStyle(color: string): React.CSSProperties {
  return { padding: "10px 12px", fontSize: 15, fontWeight: 500, color, borderBottom: "1px solid rgba(255,255,255,0.04)", fontVariantNumeric: "tabular-nums" };
}
function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    background: active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: active ? "#fff" : "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  };
}
function fmtPct(count: number | undefined, total: number | undefined): string {
  if (!total || total === 0 || count === undefined) return "—";
  return `${Math.round((count / total) * 100)}%`;
}
function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>
      <span style={{ marginBottom: 4 }}>{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: 13, padding: "6px 10px", fontFamily: "inherit" }} />
    </label>
  );
}
