"use client";

// Country filter pills — All / Tier 1 / Tier 2 / US only / India only.
//
// Backed by the shared matchesCountryFilter helper: `tier_1` / `tier_2`
// use the persisted `country_tier` field; `us` / `india` are timezone
// subsets on `userLocalTimeZone`.
//
// Drives a `c` URL param. Preserves every other param (gender, source,
// cohort compare) via useSearchParams so switching country doesn't
// reset the rest of the page state.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { COUNTRY_TABS, type CountryFilter } from "./countryFilter";

export function CountryTabs({
  selected,
  totals,
}: {
  selected: CountryFilter;
  totals: Record<CountryFilter, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setCountry = (id: CountryFilter) => {
    const next = new URLSearchParams(params.toString());
    if (id === "all") next.delete("c");
    else next.set("c", id);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

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
        Country
      </div>
      <div
        style={{
          display: "inline-flex",
          gap: 2,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 999,
          padding: 3,
        }}
      >
        {COUNTRY_TABS.map((tab) => {
          const active = tab.id === selected;
          const count = totals[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCountry(tab.id)}
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
              {tab.label}{" "}
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
