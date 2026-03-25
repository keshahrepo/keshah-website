"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface WhatsAppMetrics {
  funnel: {
    paywall_viewed: number;
    has_phone_number: number;
    phone_collection_rate: string;
    whatsapp_messaged: number;
    total_converted: number;
    not_converted: number;
  };
  conversion_sources: {
    direct: number;
    trial_modal: number;
    whatsapp_influenced: number;
    unknown: number;
  };
  rates: {
    overall: string;
    direct_rate: string;
    trial_modal_rate: string;
    whatsapp_conversion_rate: string;
  };
  whatsapp: {
    messaged: number;
    converted: number;
    stopped: number;
    stop_rate: string;
    conversion_by_day: Record<string, number>;
    templates_sent: Record<string, number>;
  };
}

export default function WhatsAppPage() {
  const [metrics, setMetrics] = useState<WhatsAppMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metrics/whatsapp")
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

  const conversionByDay = Object.entries(metrics.whatsapp.conversion_by_day)
    .sort(([a], [b]) => {
      const dayA = parseInt(a.replace("day_", ""));
      const dayB = parseInt(b.replace("day_", ""));
      return dayA - dayB;
    });

  const templatesSent = Object.entries(metrics.whatsapp.templates_sent)
    .sort(([, a], [, b]) => b - a);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>
          India WhatsApp Funnel
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          WhatsApp nurture performance and conversion tracking
        </p>
      </div>

      {/* Funnel overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 32 }}>
        <MetricCard label="Paywall Viewed" value={metrics.funnel.paywall_viewed} />
        <MetricCard label="Has Phone Number" value={metrics.funnel.has_phone_number} />
        <MetricCard label="WhatsApp Messaged" value={metrics.whatsapp.messaged} />
        <MetricCard label="Total Converted" value={metrics.funnel.total_converted} />
        <MetricCard label="Overall Rate" value={metrics.rates.overall} />
      </div>

      {/* Conversion sources */}
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Conversion Sources</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 32 }}>
        <MetricCard label="Direct (paywall)" value={metrics.conversion_sources.direct} subtitle={metrics.rates.direct_rate} />
        <MetricCard label="Trial Modal" value={metrics.conversion_sources.trial_modal} subtitle={metrics.rates.trial_modal_rate} />
        <MetricCard label="WhatsApp Influenced" value={metrics.conversion_sources.whatsapp_influenced} subtitle={metrics.rates.whatsapp_conversion_rate} />
      </div>

      {/* WhatsApp engagement */}
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>WhatsApp Engagement</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 32 }}>
        <MetricCard label="Messaged" value={metrics.whatsapp.messaged} />
        <MetricCard label="Converted" value={metrics.whatsapp.converted} />
        <MetricCard label="Stopped" value={metrics.whatsapp.stopped} subtitle={metrics.whatsapp.stop_rate} />
      </div>

      {/* Conversion by day */}
      {conversionByDay.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Conversions by WhatsApp Day</h3>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 32,
          }}>
            {conversionByDay.map(([day, count]) => (
              <div key={day} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>
                  {day.replace("day_", "Day ")}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Messages sent by template */}
      {templatesSent.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Messages Sent by Template</h3>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: 20,
          }}>
            {templatesSent.map(([template, count]) => (
              <div key={template} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                  {template.replace("nurture_", "").replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
