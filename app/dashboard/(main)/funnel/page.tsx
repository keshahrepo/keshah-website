"use client";

import { useCallback, useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface StepData {
  step: string;
  label: string;
  users: number;
  views: number;
  dropoff: number;
  retention: number;
  isSubStep?: boolean;
}

interface FunnelStats {
  ok: boolean;
  days: number;
  totalSessions: number;
  totalEvents: number;
  funnel: StepData[];
}

const PERIOD_OPTIONS = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
];

// Source attribution strings come from flow-context.tsx — every step-view
// event is tagged with the source matching its landing path. Keep this list
// in sync if new creator funnels are added under CREATOR_CONFIGS.
const SOURCE_OPTIONS = [
  { value: "us_weekly_trial", label: "/startus3 (generic US)", path: "/startus3" },
  { value: "us_women_mandy", label: "/mandy (Mandy)", path: "/mandy" },
  { value: "us_women_jennifer", label: "/f/jennifer (Jennifer)", path: "/f/jennifer" },
  { value: "us_women_donna", label: "/f/donna (Donna)", path: "/f/donna" },
  { value: "us_trial", label: "/startfree (US trial)", path: "/startfree" },
  { value: "us_kit", label: "/start (default)", path: "/start" },
];

export default function FunnelPage() {
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [source, setSource] = useState("us_weekly_trial");

  const fetchStats = useCallback(async (d: number, src: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/funnel/stats?days=${d}&source=${encodeURIComponent(src)}`);
      const data = await res.json();
      if (data.ok) setStats(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats(days, source);
  }, [days, source, fetchStats]);

  const selectedSource = SOURCE_OPTIONS.find((s) => s.value === source) ?? SOURCE_OPTIONS[0];

  const firstStepUsers = stats?.funnel[0]?.users ?? 0;
  const paywallStep = stats?.funnel.find((s) => s.step === "trialPaywall");
  const purchaseStep = stats?.funnel.find((s) => s.step === "purchaseSuccess");

  const paywallRate =
    firstStepUsers > 0 && paywallStep
      ? ((paywallStep.users / firstStepUsers) * 100).toFixed(1)
      : "—";
  const conversionRate =
    firstStepUsers > 0 && purchaseStep
      ? ((purchaseStep.users / firstStepUsers) * 100).toFixed(1)
      : "—";

  return (
    <div style={{ padding: "0 0 48px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>
            Funnel · {selectedSource.path}
          </h1>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            style={{
              padding: "6px 28px 6px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              appearance: "none",
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='rgba(255,255,255,0.5)' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
            }}
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                style={{ background: "#1a1a1a", color: "#fff" }}
              >
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                background:
                  days === opt.days
                    ? "rgba(255,255,255,0.15)"
                    : "rgba(255,255,255,0.05)",
                color:
                  days === opt.days
                    ? "#fff"
                    : "rgba(255,255,255,0.4)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <MetricCard
          label="Total sessions"
          value={loading ? "…" : String(stats?.totalSessions ?? 0)}
        />
        <MetricCard
          label="Reached paywall"
          value={loading ? "…" : `${paywallStep?.users ?? 0} (${paywallRate}%)`}
        />
        <MetricCard
          label="Purchased"
          value={
            loading
              ? "…"
              : `${purchaseStep?.users ?? 0} (${conversionRate}%)`
          }
        />
      </div>

      {/* Funnel table */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 120px",
            padding: "14px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            fontSize: 12,
            fontWeight: 600,
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          <span>Step</span>
          <span style={{ textAlign: "right" }}>Users</span>
          <span style={{ textAlign: "right" }}>Drop-off</span>
          <span style={{ textAlign: "right" }}>Retention</span>
          <span />
        </div>

        {loading ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "rgba(255,255,255,0.3)",
              fontSize: 14,
            }}
          >
            Loading…
          </div>
        ) : stats?.funnel.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "rgba(255,255,255,0.3)",
              fontSize: 14,
            }}
          >
            No data yet. Events will appear as users go through the funnel.
          </div>
        ) : (
          stats?.funnel.map((s, i) => {
            const barWidth =
              firstStepUsers > 0
                ? Math.max(4, (s.users / firstStepUsers) * 100)
                : 0;
            const isHighDrop = s.dropoff > 30;

            return (
              <div
                key={s.step}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 120px",
                  padding: "12px 20px",
                  borderBottom:
                    i < (stats?.funnel.length ?? 0) - 1
                      ? "1px solid rgba(255,255,255,0.04)"
                      : "none",
                  alignItems: "center",
                  fontSize: 14,
                }}
              >
                <span
                  style={{
                    color: s.users > 0
                      ? s.isSubStep ? "rgba(255,255,255,0.5)" : "#fff"
                      : "rgba(255,255,255,0.15)",
                    fontWeight: s.isSubStep ? 400 : 500,
                    fontSize: s.isSubStep ? 13 : 14,
                    paddingLeft: s.isSubStep ? 20 : 0,
                  }}
                >
                  {!s.isSubStep && (
                    <span
                      style={{
                        color: "rgba(255,255,255,0.2)",
                        fontSize: 12,
                        marginRight: 8,
                      }}
                    >
                      {i + 1}
                    </span>
                  )}
                  {s.label}
                </span>
                <span
                  style={{
                    textAlign: "right",
                    color: s.users > 0 ? "#fff" : "rgba(255,255,255,0.2)",
                    fontWeight: 600,
                  }}
                >
                  {s.users}
                </span>
                <span
                  style={{
                    textAlign: "right",
                    color: isHighDrop
                      ? "#FF6B6B"
                      : i === 0
                      ? "rgba(255,255,255,0.2)"
                      : "rgba(255,255,255,0.5)",
                    fontWeight: isHighDrop ? 600 : 400,
                  }}
                >
                  {i === 0 ? "—" : `-${s.dropoff}%`}
                </span>
                <span
                  style={{
                    textAlign: "right",
                    color:
                      i === 0
                        ? "rgba(255,255,255,0.2)"
                        : s.retention >= 70
                        ? "#4CAF50"
                        : "rgba(255,255,255,0.5)",
                  }}
                >
                  {i === 0 ? "—" : `${s.retention}%`}
                </span>
                {/* Visual bar */}
                <div
                  style={{
                    height: 8,
                    borderRadius: 4,
                    background: "rgba(255,255,255,0.06)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${barWidth}%`,
                      borderRadius: 4,
                      background:
                        s.step === "purchaseSuccess"
                          ? "#4CAF50"
                          : "rgba(255,255,255,0.25)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
