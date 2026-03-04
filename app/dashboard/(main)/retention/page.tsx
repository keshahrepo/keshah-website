"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";
import FunnelChart from "@/components/FunnelChart";
import { ChartCard, DonutChart } from "@/components/SimpleChart";

interface Metrics {
  retention: {
    day_7: { eligible: number; active: number; rate: number };
    day_14?: { eligible: number; active: number; rate: number };
    day_30: { eligible: number; active: number; rate: number };
  };
  routine: { completed_today: number; total_active: number };
  check_in_day_30: Record<string, number>;
  check_in_day_60: Record<string, number>;
  regrowth_funnel: { education_started: number; education_done: number; consultation: number; purchased: number };
  inflammation_funnel: { check_completed: number; positive: number; kit_purchased: number };
}

const CHECK_IN_LABELS: Record<string, string> = {
  significantly_less: "Much Less",
  slightly_less: "Slightly Less",
  about_the_same: "Same",
  slightly_more: "Slightly More",
  significantly_more: "Much More",
  none: "None",
  few_strands: "Few Strands",
  small_clump: "Small Clump",
  large_clump: "Large Clump",
  very_large_clump: "Very Large",
};

export default function RetentionPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metrics/today")
      .then((r) => r.json())
      .then((data) => {
        setMetrics(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <p style={{ color: "#f87171", fontSize: 14 }}>Failed to load</p>
      </div>
    );
  }

  const routineRate = metrics.routine.total_active > 0
    ? Math.round((metrics.routine.completed_today / metrics.routine.total_active) * 100)
    : 0;

  const day30Data = Object.entries(metrics.check_in_day_30)
    .map(([name, value]) => ({
      name: CHECK_IN_LABELS[name] || name.replace(/_/g, " "),
      value,
    }))
    .sort((a, b) => b.value - a.value);

  const day60Data = Object.entries(metrics.check_in_day_60)
    .map(([name, value]) => ({
      name: CHECK_IN_LABELS[name] || name.replace(/_/g, " "),
      value,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>In-App Retention</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          Routine completion, check-ins, and product funnels
        </p>
      </div>

      {/* Retention + Routine metrics */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}>
        <MetricCard
          label="Day 7"
          value={`${metrics.retention.day_7.rate}%`}
          subtitle={`${metrics.retention.day_7.active}/${metrics.retention.day_7.eligible}`}
        />
        <MetricCard
          label="Day 14"
          value={`${metrics.retention.day_14?.rate ?? 0}%`}
          subtitle={`${metrics.retention.day_14?.active ?? 0}/${metrics.retention.day_14?.eligible ?? 0}`}
        />
        <MetricCard
          label="Day 30"
          value={`${metrics.retention.day_30.rate}%`}
          subtitle={`${metrics.retention.day_30.active}/${metrics.retention.day_30.eligible}`}
        />
        <MetricCard
          label="Routines Today"
          value={metrics.routine.completed_today}
          subtitle={`${routineRate}% of active`}
        />
        <MetricCard
          label="Active Users"
          value={metrics.routine.total_active}
          subtitle="with any progress"
        />
      </div>

      {/* Check-in responses */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 16,
        marginBottom: 24,
      }}>
        {day30Data.length > 0 ? (
          <ChartCard title="Day 30 Check-in Responses">
            <DonutChart data={day30Data} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
              {day30Data.map((d) => (
                <span key={d.name} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  {d.name}: {d.value}
                </span>
              ))}
            </div>
          </ChartCard>
        ) : (
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: "40px 24px",
            textAlign: "center",
          }}>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No Day 30 check-in data yet</p>
          </div>
        )}

        {day60Data.length > 0 ? (
          <ChartCard title="Day 60 Check-in Responses">
            <DonutChart data={day60Data} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
              {day60Data.map((d) => (
                <span key={d.name} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  {d.name}: {d.value}
                </span>
              ))}
            </div>
          </ChartCard>
        ) : (
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: "40px 24px",
            textAlign: "center",
          }}>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No Day 60 check-in data yet</p>
          </div>
        )}
      </div>

      {/* Regrowth funnel */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 16,
        marginBottom: 24,
      }}>
        <FunnelChart
          title="Regrowth Funnel"
          steps={[
            { label: "Education Started", value: metrics.regrowth_funnel.education_started, color: "#818cf8" },
            { label: "Education Done", value: metrics.regrowth_funnel.education_done, color: "#a78bfa" },
            { label: "Consultation Done", value: metrics.regrowth_funnel.consultation, color: "#c4b5fd" },
            { label: "Kit Purchased", value: metrics.regrowth_funnel.purchased, color: "#4ade80" },
          ]}
        />

        <FunnelChart
          title="Inflammation Funnel"
          steps={[
            { label: "Check Completed", value: metrics.inflammation_funnel.check_completed, color: "#fbbf24" },
            { label: "Positive Result", value: metrics.inflammation_funnel.positive, color: "#f59e0b" },
            { label: "Kit Purchased", value: metrics.inflammation_funnel.kit_purchased, color: "#4ade80" },
          ]}
        />
      </div>

    </div>
  );
}
