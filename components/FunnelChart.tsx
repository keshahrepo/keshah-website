"use client";

interface FunnelStep {
  label: string;
  value: number;
  color?: string;
}

interface FunnelChartProps {
  steps: FunnelStep[];
  title?: string;
}

export default function FunnelChart({ steps, title }: FunnelChartProps) {
  const maxValue = steps[0]?.value || 1;

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      padding: "20px 24px",
    }}>
      {title && (
        <h3 style={{
          fontSize: 13,
          fontWeight: 600,
          color: "rgba(255,255,255,0.5)",
          marginBottom: 20,
          letterSpacing: "0.3px",
          textTransform: "uppercase",
        }}>
          {title}
        </h3>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {steps.map((step, i) => {
          const pct = maxValue > 0 ? (step.value / maxValue) * 100 : 0;
          const dropPct = i > 0 && steps[i - 1].value > 0
            ? ((steps[i - 1].value - step.value) / steps[i - 1].value * 100).toFixed(0)
            : null;

          return (
            <div key={step.label}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 6,
              }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                  {step.label}
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
                    {step.value.toLocaleString()}
                  </span>
                  {dropPct && (
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                      -{dropPct}%
                    </span>
                  )}
                </div>
              </div>
              <div style={{
                height: 8,
                background: "rgba(255,255,255,0.06)",
                borderRadius: 4,
                overflow: "hidden",
              }}>
                <div style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: step.color || `rgba(255,255,255,${0.6 - i * 0.12})`,
                  borderRadius: 4,
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
