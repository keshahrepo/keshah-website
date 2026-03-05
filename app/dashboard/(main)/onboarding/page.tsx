"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";
import FunnelChart from "@/components/FunnelChart";
import { ChartCard, DonutChart } from "@/components/SimpleChart";

type GeoKey = "all" | "tier_1" | "india" | "tier_2";

interface GeoFunnel {
  signed_up: number;
  onboarding_complete: number;
  paywall_viewed: number;
  purchased: number;
}

interface Metrics {
  total_users: number;
  funnel: GeoFunnel;
  geo_funnels: Record<string, GeoFunnel>;
  geo_referrals: Record<string, Record<string, number>>;
  geo_stages: Record<string, Record<string, number>>;
  users_by_type: Record<string, number>;
  users_by_geo: Record<string, number>;
  referral_sources: Record<string, number>;
  purchases: { regrowth_kits: number; scalp_health_kits: number; donations: number };
}

const GEO_LABELS: Record<GeoKey, string> = {
  all: "All Users",
  tier_1: "Tier 1",
  india: "India",
  tier_2: "Tier 2",
};

export default function OnboardingPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGeo, setSelectedGeo] = useState<GeoKey>("all");

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

  // Get funnel for selected geo
  const funnel: GeoFunnel = selectedGeo === "all"
    ? metrics.funnel
    : metrics.geo_funnels?.[selectedGeo] || { signed_up: 0, onboarding_complete: 0, paywall_viewed: 0, purchased: 0 };

  const referrals = selectedGeo === "all"
    ? metrics.referral_sources
    : metrics.geo_referrals?.[selectedGeo] || {};

  const geoUserCount = selectedGeo === "all"
    ? metrics.total_users
    : metrics.users_by_geo?.[selectedGeo] || 0;

  const conversionRate = funnel.signed_up > 0
    ? ((funnel.purchased / funnel.signed_up) * 100).toFixed(1)
    : "0";

  const paywallConversion = funnel.paywall_viewed > 0
    ? ((funnel.purchased / funnel.paywall_viewed) * 100).toFixed(1)
    : "0";

  const onboardingRate = funnel.signed_up > 0
    ? ((funnel.onboarding_complete / funnel.signed_up) * 100).toFixed(0)
    : "0";

  const referralData = Object.entries(referrals)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({
      name: name.replace(/_/g, " "),
      value,
    }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>Onboarding & Revenue</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            Funnel analysis and revenue breakdown
          </p>
        </div>

        {/* Geo selector */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "tier_1", "india", "tier_2"] as GeoKey[]).map((geo) => (
            <button
              key={geo}
              onClick={() => setSelectedGeo(geo)}
              style={{
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 20,
                border: "none",
                cursor: "pointer",
                background: selectedGeo === geo ? "#fff" : "rgba(255,255,255,0.06)",
                color: selectedGeo === geo ? "#000" : "rgba(255,255,255,0.5)",
                transition: "all 0.15s",
              }}
            >
              {GEO_LABELS[geo]}
            </button>
          ))}
        </div>
      </div>

      {/* Top metrics */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}>
        <MetricCard
          label="Users"
          value={geoUserCount.toLocaleString()}
          subtitle={selectedGeo !== "all" ? GEO_LABELS[selectedGeo] : undefined}
        />
        <MetricCard
          label="Overall Conversion"
          value={`${conversionRate}%`}
          subtitle="signup → purchase"
        />
        <MetricCard
          label="Paywall Conversion"
          value={`${paywallConversion}%`}
          subtitle="paywall → purchase"
        />
        <MetricCard
          label="Onboarding Rate"
          value={`${onboardingRate}%`}
          subtitle="signup → onboarding"
        />
        <MetricCard
          label="Purchased"
          value={funnel.purchased}
        />
      </div>

      {/* Funnel */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 16,
        marginBottom: 24,
      }}>
        <FunnelChart
          title={`Funnel — ${GEO_LABELS[selectedGeo]}`}
          steps={[
            { label: "Signed Up", value: funnel.signed_up },
            { label: "Onboarding Done", value: funnel.onboarding_complete },
            { label: "Qualified", value: funnel.paywall_viewed },
            { label: "Purchased", value: funnel.purchased, color: "#4ade80" },
          ]}
        />

        {/* Referral sources */}
        {referralData.length > 0 ? (
          <ChartCard title={`How They Heard — ${GEO_LABELS[selectedGeo]}`}>
            <DonutChart data={referralData} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
              {referralData.map((s) => (
                <span key={s.name} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>
                  {s.name}: {s.value}
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
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
              Referral data will appear as new users sign up with the updated app
            </p>
          </div>
        )}
      </div>

      {/* Bottom metrics */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
      }}>
        <MetricCard label="Tier 1" value={metrics.users_by_geo.tier_1 || 0} />
        <MetricCard label="India" value={metrics.users_by_geo.india || 0} />
        <MetricCard label="Tier 2" value={metrics.users_by_geo.tier_2 || 0} />
        <MetricCard label="Regrowth Kits" value={metrics.purchases.regrowth_kits} />
        <MetricCard label="Scalp Kits" value={metrics.purchases.scalp_health_kits} />
        <MetricCard label="Donations" value={`$${metrics.purchases.donations}`} />
      </div>
    </div>
  );
}
