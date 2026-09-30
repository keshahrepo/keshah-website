"use client";

// Outreach-sender filter tabs. Slices the page by who closed the lead via a
// 1:1 message, as opposed to CampaignTabs which slices by what drove the
// install. Senders appear automatically once their first tapped link lands.
//
// UI-only; the type and matcher live in outreachSender.ts.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { OutreachSenderFilter } from "./outreachSender";

export function OutreachSenderTabs({
  selected,
  totals,
}: {
  selected: OutreachSenderFilter;
  // Ordered [id, count][] — caller sorts. First entry should be ["all", total].
  totals: Array<[string, number]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setSender = (id: string) => {
    const next = new URLSearchParams(params.toString());
    if (id === "all") next.delete("sender");
    else next.set("sender", id);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  // Only "all" — nobody has tapped an outreach link in this slice, so the
  // filter would be a row with one dead button. Hide it.
  if (totals.length <= 1) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.4)",
          marginBottom: 6,
        }}
      >
        Outreach sender
      </div>
      <div
        style={{
          display: "inline-flex",
          flexWrap: "wrap",
          gap: 2,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 999,
          padding: 3,
        }}
      >
        {totals.map(([id, count]) => {
          const active = id === selected || (id === "all" && selected === "all");
          const label = id === "all" ? "All" : id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSender(id)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                background: active ? "#fff" : "transparent",
                color: active ? "#000" : "rgba(255,255,255,0.65)",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {label}{" "}
              <span
                style={{
                  fontWeight: 500,
                  opacity: 0.6,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
