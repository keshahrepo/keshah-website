"use client";

// Version filter tabs — pick a release to filter the whole page to
// users who signed up in that release window. Uses the same `?new=slug`
// URL param the CohortPicker uses in compare mode, so single-release
// and compare modes share state cleanly.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Release } from "@/lib/release-history";

export function VersionTabs({
  selectedSlug,
  releases,
}: {
  selectedSlug: string;
  releases: Release[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setSlug = (slug: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("new", slug);
    router.push(`${pathname}?${next.toString()}`);
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
        Version
      </div>
      <div
        style={{
          display: "inline-flex",
          gap: 2,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 999,
          padding: 3,
          flexWrap: "wrap",
        }}
      >
        {releases.map((rel) => {
          const active = rel.slug === selectedSlug;
          return (
            <button
              key={rel.slug}
              type="button"
              onClick={() => setSlug(rel.slug)}
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
                whiteSpace: "nowrap",
              }}
            >
              {rel.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
