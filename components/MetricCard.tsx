"use client";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  color?: string;
}

export default function MetricCard({ label, value, subtitle, trend, color }: MetricCardProps) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      padding: "18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: 500,
        color: "rgba(255,255,255,0.4)",
        letterSpacing: "0.3px",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 28,
        fontWeight: 700,
        color: color || "#fff",
        letterSpacing: "-0.5px",
        lineHeight: 1,
      }}>
        {value}
      </span>
      {(subtitle || trend) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          {trend && (
            <span style={{
              fontSize: 12,
              fontWeight: 500,
              color: trend.value >= 0 ? "#4ade80" : "#f87171",
            }}>
              {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}
            </span>
          )}
          {subtitle && (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
