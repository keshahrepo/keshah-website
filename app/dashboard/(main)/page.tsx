"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";
import FunnelChart from "@/components/FunnelChart";
import { ChartCard, SimpleLineChart } from "@/components/SimpleChart";

interface Metrics {
  date: string;
  cohort_start?: string;
  total_users: number;
  new_users: { today: number; week: number; month: number };
  users_by_type: Record<string, number>;
  users_by_geo: Record<string, number>;
  funnel: { signed_up: number; onboarding_complete: number; paywall_viewed: number; purchased: number };
  referral_sources: Record<string, number>;
  retention: {
    day_7: { eligible: number; active: number; rate: number };
    day_14?: { eligible: number; active: number; rate: number };
    day_30: { eligible: number; active: number; rate: number };
  };
  routine: { completed_today: number; total_active: number };
  purchases: { regrowth_kits: number; scalp_health_kits: number; donations: number };
}

interface RevenueData {
  revenue?: number;
  mrr?: number;
  active_subscribers?: number;
  active_trials?: number;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

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

  const retentionData = [
    { label: "Day 7", value: metrics.retention.day_7.rate },
    { label: "Day 14", value: metrics.retention.day_14?.rate ?? 0 },
    { label: "Day 30", value: metrics.retention.day_30.rate },
  ];

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>
          Good morning
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          {metrics.cohort_start && (
            <span style={{ marginLeft: 8, opacity: 0.6 }}>
              &middot; Since {new Date(metrics.cohort_start + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </p>
      </div>

      {/* Top metrics */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}>
        <MetricCard
          label="Total Users"
          value={metrics.total_users.toLocaleString()}
          subtitle={`+${metrics.new_users.today} today`}
        />
        <MetricCard
          label="New This Week"
          value={metrics.new_users.week}
        />
        <MetricCard
          label="New This Month"
          value={metrics.new_users.month}
        />
        <MetricCard
          label="Routines Today"
          value={metrics.routine.completed_today}
          subtitle={`of ${metrics.routine.total_active} active`}
        />
      </div>

      {/* Revenue row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}>
        {revenue && (
          <>
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
          </>
        )}
        <MetricCard
          label="Regrowth Kits"
          value={metrics.purchases.regrowth_kits}
        />
        <MetricCard
          label="Scalp Health Kits"
          value={metrics.purchases.scalp_health_kits}
        />
      </div>

      {/* Funnel + Retention row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 16,
        marginBottom: 24,
      }}>
        <FunnelChart
          title="Conversion Funnel"
          steps={[
            { label: "Signed Up", value: metrics.funnel.signed_up },
            { label: "Onboarding Done", value: metrics.funnel.onboarding_complete },
            { label: "Qualified", value: metrics.funnel.paywall_viewed },
            { label: "Purchased", value: metrics.funnel.purchased, color: "#4ade80" },
          ]}
        />

        <ChartCard title="Retention Rates">
          <SimpleLineChart
            data={retentionData}
            dataKey="value"
            color="#818cf8"
          />
        </ChartCard>
      </div>

      {/* Geo breakdown */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 16,
        marginBottom: 24,
      }}>
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "20px 24px",
        }}>
          <h3 style={{
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(255,255,255,0.5)",
            marginBottom: 20,
            letterSpacing: "0.3px",
            textTransform: "uppercase",
          }}>
            Users by Geography
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.entries(metrics.users_by_geo).map(([region, count]) => (
              <div key={region}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", textTransform: "capitalize" }}>
                    {region === "tier_1" ? "Tier 1" : region === "tier_2" ? "Tier 2" : "India"}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
                    {count.toLocaleString()}
                  </span>
                </div>
                <div style={{
                  height: 6,
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 3,
                }}>
                  <div style={{
                    width: `${metrics.total_users > 0 ? (count / metrics.total_users) * 100 : 0}%`,
                    height: "100%",
                    background: region === "tier_1" ? "#818cf8" : region === "india" ? "#fbbf24" : "#38bdf8",
                    borderRadius: 3,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Retention breakdown */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
        marginBottom: 24,
      }}>
        <MetricCard
          label="Day 7 Retention"
          value={`${metrics.retention.day_7.rate}%`}
          subtitle={`${metrics.retention.day_7.active}/${metrics.retention.day_7.eligible}`}
        />
        <MetricCard
          label="Day 14 Retention"
          value={`${metrics.retention.day_14?.rate ?? 0}%`}
          subtitle={`${metrics.retention.day_14?.active ?? 0}/${metrics.retention.day_14?.eligible ?? 0}`}
        />
        <MetricCard
          label="Day 30 Retention"
          value={`${metrics.retention.day_30.rate}%`}
          subtitle={`${metrics.retention.day_30.active}/${metrics.retention.day_30.eligible}`}
        />
      </div>
    </div>
  );
}
