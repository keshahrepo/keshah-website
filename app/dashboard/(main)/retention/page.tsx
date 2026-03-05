"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface Metrics {
  day_completion: Record<string, number>;
  day_eligible: Record<string, number>;
  users_with_progress: number;
  funnel: { purchased: number };
  regrowth_funnel: { consultation: number; purchased: number };
}

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

  const purchased = metrics.funnel?.purchased || 0;
  const dayCompletionMap = metrics.day_completion || {};
  const dayEligibleMap = metrics.day_eligible || {};

  // Key milestone days — % of eligible users who completed that day
  const milestones = [1, 2, 3, 7, 10, 15, 30, 45, 60]
    .map((d) => {
      const completed = dayCompletionMap[String(d)] || 0;
      const eligible = dayEligibleMap[String(d)] || 0;
      return { day: d, completed, eligible, pct: eligible > 0 ? Math.round((completed / eligible) * 100) : 0 };
    })
    .filter((m) => m.eligible > 0); // Only show days where we have eligible users

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>In-App Retention</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          Day-by-day completion rates for purchased users ({purchased} total)
        </p>
      </div>

      {/* Key milestone metrics */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}>
        {milestones.map((m) => (
          <MetricCard
            key={m.day}
            label={`Day ${m.day}`}
            value={`${m.pct}%`}
            subtitle={`${m.completed}/${m.eligible} eligible`}
          />
        ))}
        <MetricCard label="Started" value={metrics.users_with_progress} subtitle={`of ${purchased} purchased`} />
      </div>

      {/* Regrowth */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}>
        <MetricCard label="Consultation Done" value={metrics.regrowth_funnel.consultation} />
        <MetricCard label="Regrowth Purchased" value={metrics.regrowth_funnel.purchased} />
      </div>

      {milestones.length === 0 && (
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "40px 24px",
          textAlign: "center",
        }}>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            No retention data yet — milestone cards will appear as users age into each day.
          </p>
        </div>
      )}
    </div>
  );
}
