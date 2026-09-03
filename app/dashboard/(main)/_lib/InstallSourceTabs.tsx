"use client";

// InstallSource filter tabs — paid vs organic vs unknown.
//
// UI-only. The type + `matchesInstallSource` helper live in
// installSource.ts (plain module) so server components can import them
// without pulling this client bundle in — Next crashes if a server
// component calls a function from a "use client" module.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { InstallSourceFilter } from "./installSource";

const TABS: Array<{ id: InstallSourceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "organic", label: "Organic" },
];

export function InstallSourceTabs({
  selected,
  totals,
}: {
  selected: InstallSourceFilter;
  totals: { all: number; paid: number; organic: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setSource = (id: InstallSourceFilter) => {
    const next = new URLSearchParams(params.toString());
    if (id === "all") next.delete("s");
    else next.set("s", id);
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
        Install source
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
        {TABS.map((tab) => {
          const active = tab.id === selected;
          const count = totals[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSource(tab.id)}
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
