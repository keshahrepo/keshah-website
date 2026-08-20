"use client";

// Day 1 row with a hover tooltip that shows the exercise-completion
// distribution: how many users did 0/1/2/.../all-K exercises, plus how
// many never even opened Day 1. Kept out of the server page so the rest
// of trial/page.tsx stays statically rendered.

import { useState } from "react";

export function Day1HoverRow({
  count,
  eligible,
  distribution,
  neverOpened,
  maxTotal,
}: {
  count: number;                // users who did ≥1 exercise on Day 1
  eligible: number;             // users old enough to have reached Day 1 (i.e., all trials)
  distribution: number[];       // distribution[k] = users who did exactly k exercises (after opening)
  neverOpened: number;          // users who never opened Day 1's screen
  maxTotal: number;             // how many exercises Day 1 has (max seen across users)
}) {
  const [hovered, setHovered] = useState(false);
  const pct = eligible === 0 ? 0 : (count / eligible) * 100;
  const startedButZero = distribution[0] ?? 0;

  // Buckets to show in tooltip: never opened, opened + 0 done, then 1..maxTotal done.
  const tooltipRows: Array<{ label: string; count: number }> = [
    { label: "Never opened Day 1", count: neverOpened },
    { label: "Opened, 0 done", count: startedButZero },
  ];
  for (let k = 1; k <= maxTotal; k++) {
    tooltipRows.push({
      label: k === maxTotal ? `All ${k} done` : `${k} done`,
      count: distribution[k] ?? 0,
    });
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr 140px",
        alignItems: "center",
        gap: 12,
        padding: "6px 0",
        position: "relative",
        cursor: "default",
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.85)",
          borderBottom: "1px dotted rgba(255,255,255,0.35)",
          display: "inline-block",
          width: "fit-content",
        }}
      >
        Day 1
      </div>
      <div
        style={{
          height: 6,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(pct, 100)}%`,
            height: "100%",
            background: "#fff",
          }}
        />
      </div>
      <div
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.75)",
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
        }}
      >
        {eligible === 0 ? (
          <span style={{ color: "rgba(255,255,255,0.35)" }}>—</span>
        ) : (
          <>
            {pct.toFixed(1)}%
            <span style={{ color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>
              {count}/{eligible}
            </span>
          </>
        )}
      </div>

      {hovered && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            background: "#111",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 10,
            padding: "10px 12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            zIndex: 20,
            minWidth: 220,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1.1,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)",
              marginBottom: 6,
            }}
          >
            Day 1 breakdown ({eligible.toLocaleString()} eligible)
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {tooltipRows.map((r) => {
              const rowPct = eligible === 0 ? 0 : (r.count / eligible) * 100;
              return (
                <div
                  key={r.label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  <span>{r.label}</span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: "rgba(255,255,255,0.75)",
                    }}
                  >
                    {r.count} <span style={{ color: "rgba(255,255,255,0.4)" }}>({rowPct.toFixed(1)}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
