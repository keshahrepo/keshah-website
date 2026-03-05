"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface Metrics {
  date: string;
  cohort_start?: string;
  total_users: number;
  new_users: { today: number; week: number; month: number };
  creator_clicks: { today: number; week: number; month: number; total: number };
  funnel: { signed_up: number; onboarding_complete: number; paywall_viewed: number; purchased: number };
  purchased_by_period: { today: number; week: number; month: number; total: number };
  tracked_signups?: { today: number; week: number; month: number; all: number };
  tracked_purchased?: { today: number; week: number; month: number; all: number };
}

interface RevenueData {
  revenue?: number;
  mrr?: number;
  active_subscribers?: number;
  active_trials?: number;
}

type TimePeriod = "today" | "week" | "month" | "all";

const PERIOD_LABELS: Record<TimePeriod, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
};

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>("all");

  useEffect(() => {
    Promise.all([
      fetch("/api/metrics/today").then((r) => r.json()),
      fetch("/api/revenue/overview").then((r) => r.json()).catch(() => null),
    ]).then(([m, r]) => {
      setMetrics(m);
      setRevenue(r?.error ? null : r);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading metrics...</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <p style={{ color: "#f87171", fontSize: 14 }}>Failed to load metrics</p>
      </div>
    );
  }

  const clicks = {
    today: metrics.creator_clicks?.today || 0,
    week: metrics.creator_clicks?.week || 0,
    month: metrics.creator_clicks?.month || 0,
    all: metrics.creator_clicks?.total || 0,
  }[period];

  const signups = {
    today: metrics.tracked_signups?.today ?? metrics.new_users.today,
    week: metrics.tracked_signups?.week ?? metrics.new_users.week,
    month: metrics.tracked_signups?.month ?? metrics.new_users.month,
    all: metrics.tracked_signups?.all ?? metrics.total_users,
  }[period];

  const purchased = {
    today: metrics.tracked_purchased?.today ?? metrics.purchased_by_period?.today ?? 0,
    week: metrics.tracked_purchased?.week ?? metrics.purchased_by_period?.week ?? 0,
    month: metrics.tracked_purchased?.month ?? metrics.purchased_by_period?.month ?? 0,
    all: metrics.tracked_purchased?.all ?? metrics.funnel.purchased,
  }[period];

  const clickToSignup = clicks > 0 ? Math.round((signups / clicks) * 100) : 0;
  const signupToPurchase = signups > 0 ? Math.round((purchased / signups) * 100) : 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>
            Good morning
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            <span style={{ marginLeft: 8, opacity: 0.6 }}>
              &middot; Since Mar 4 (link tracking)
            </span>
          </p>
        </div>

        {/* Time period selector */}
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3 }}>
          {(["today", "week", "month", "all"] as TimePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: period === p ? "rgba(255,255,255,0.1)" : "transparent",
                color: period === p ? "#fff" : "rgba(255,255,255,0.4)",
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Top metrics */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}>
        <MetricCard
          label="Clicks"
          value={clicks.toLocaleString()}
          subtitle={PERIOD_LABELS[period]}
          color="#4ade80"
        />
        <MetricCard
          label="Signups"
          value={signups.toLocaleString()}
          subtitle={clicks > 0 ? `${clickToSignup}% of clicks` : PERIOD_LABELS[period]}
        />
        <MetricCard
          label="Purchased"
          value={purchased}
          subtitle={`${signupToPurchase}% of signups`}
        />
      </div>

      {/* Revenue row */}
      {revenue && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}>
          <MetricCard
            label="MRR"
            value={revenue.mrr ? `$${revenue.mrr.toLocaleString()}` : "—"}
            color="#4ade80"
          />
          <MetricCard
            label="Active Subscribers"
            value={revenue.active_subscribers || "—"}
          />
          <MetricCard
            label="Active Trials"
            value={revenue.active_trials || "—"}
          />
        </div>
      )}
    </div>
  );
}
