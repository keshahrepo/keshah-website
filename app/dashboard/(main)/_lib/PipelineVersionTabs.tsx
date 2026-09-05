"use client";

// Pipeline-scoped version filter tabs.
//
// Similar to VersionTabs (used on trial + onboarding) but with two
// differences that matter for /dashboard/pipeline:
//   1. Includes an explicit "All versions" tab — the default kanban
//      view. Selecting it clears the URL param entirely so the
//      unfiltered view is bookmarkable at the bare pathname.
//   2. Writes to `?version=<slug>` instead of `?new=<slug>` so the
//      pipeline filter doesn't collide with the trial/onboarding
//      cohort picker's `new` param if we ever cross-link.
//
// Each tab also shows a count of ideas assigned to that version so
// Aadi can eyeball release size without opening it.

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export interface PipelineVersionTabOption {
  slug: string;
  label: string;
  count: number;
  isInFlight: boolean;
}

export function PipelineVersionTabs({
  selectedSlug,
  options,
  allCount,
}: {
  selectedSlug: string | null;
  options: PipelineVersionTabOption[];
  allCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setSlug = (slug: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (slug === null) next.delete("version");
    else next.set("version", slug);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const allActive = selectedSlug === null;

  return (
    <div style={{ marginBottom: 20 }}>
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
        <TabButton
          active={allActive}
          onClick={() => setSlug(null)}
          label="All versions"
          count={allCount}
        />
        {options.map((opt) => (
          <TabButton
            key={opt.slug}
            active={opt.slug === selectedSlug}
            onClick={() => setSlug(opt.slug)}
            label={opt.label}
            count={opt.count}
          />
        ))}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          opacity: 0.6,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count.toLocaleString()}
      </span>
    </button>
  );
}
