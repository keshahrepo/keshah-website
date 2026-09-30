"use client";

// Campaign / influencer filter tabs — dynamic list of campaigns pulled
// from the current cohort. Adds an "All" tab at the front; the rest are
// sorted by user count descending so the most-populated campaigns land
// first. New influencer campaigns auto-appear once their first user's
// attribution_campaign field is populated.
//
// UI-only. Type + `matchesCampaign` helper live in campaign.ts.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { CampaignFilter } from "./campaign";

export function CampaignTabs({
  selected,
  totals,
}: {
  selected: CampaignFilter;
  // Ordered [id, count][] — caller sorts. First entry should be ["all", totalCount].
  totals: Array<[string, number]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setCampaign = (id: string) => {
    const next = new URLSearchParams(params.toString());
    if (id === "all") next.delete("camp");
    else next.set("camp", id);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  if (totals.length <= 1) return null; // Only "all" — hide the filter entirely

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
        Campaign / Influencer
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
              onClick={() => setCampaign(id)}
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
