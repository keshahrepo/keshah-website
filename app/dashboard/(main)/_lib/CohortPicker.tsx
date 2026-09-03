"use client";

// Cohort picker + hypothesis banner. Renders two release-slug dropdowns
// (baseline + new) that drive the current page's ?baseline=X&new=Y URL
// params. Below the dropdowns: the "new" release's description +
// tracked-metric labels + outcome note (if filled).
//
// Every metric row on the page reads the same URL params server-side to
// know which two windows to compute + which rows to highlight.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { RELEASES, getRelease, type Release } from "@/lib/release-history";

export function CohortPicker({
  baselineSlug,
  newSlug,
  labelForKey,
  releases,
}: {
  baselineSlug: string;
  newSlug: string;
  // Map from metric-key to human label. Used to render the tracked-metric
  // pills in the banner. Passed by the page since each page has its own
  // metric namespace.
  labelForKey: Record<string, string>;
  // The list of releases to show in the dropdown. Defaults to the full
  // list; mobile pages should pass MOBILE_RELEASES and web pages should
  // pass WEB_RELEASES so a web release can't be selected on a mobile
  // page's dropdown (and vice versa).
  releases?: Release[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const list = releases ?? RELEASES;

  const setSlug = (which: "baseline" | "new", slug: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(which, slug);
    router.push(`${pathname}?${next.toString()}`);
  };

  const baseline = getRelease(baselineSlug);
  const newRel = getRelease(newSlug);
  const onlyOneRelease = list.length < 2;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Dropdowns */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <ReleaseSelect
          label="Baseline"
          value={baselineSlug}
          onChange={(v) => setSlug("baseline", v)}
          releases={list}
        />
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 18 }}>→</div>
        <ReleaseSelect
          label="New"
          value={newSlug}
          onChange={(v) => setSlug("new", v)}
          releases={list}
        />
      </div>

      {onlyOneRelease ? (
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderLeft: "3px solid rgba(255,255,255,0.25)",
            borderRadius: 10,
            padding: "12px 14px",
            fontSize: 12,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          Only one release logged so far. Add a new entry to{" "}
          <code style={{ color: "rgba(255,255,255,0.8)" }}>lib/release-history.ts</code>{" "}
          after your next ship to unlock comparison.
        </div>
      ) : (
        <HypothesisBanner
          baseline={baseline}
          newRel={newRel}
          labelForKey={labelForKey}
        />
      )}
    </div>
  );
}

function ReleaseSelect({
  label,
  value,
  onChange,
  releases,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  releases: Release[];
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: 10,
        color: "rgba(255,255,255,0.4)",
        textTransform: "uppercase",
        letterSpacing: 1,
      }}
    >
      <span style={{ marginBottom: 4 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: "8px 12px",
          color: "#fff",
          fontSize: 13,
          fontWeight: 500,
          minWidth: 200,
        }}
      >
        {releases.map((r) => (
          <option key={r.slug} value={r.slug} style={{ background: "#000" }}>
            {r.label} ({r.date})
          </option>
        ))}
      </select>
    </label>
  );
}

function HypothesisBanner({
  baseline,
  newRel,
  labelForKey,
}: {
  baseline: Release | null;
  newRel: Release | null;
  labelForKey: Record<string, string>;
}) {
  if (!newRel) return null;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderLeft: "3px solid #DAA520",
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.5)",
          marginBottom: 6,
        }}
      >
        {baseline ? `${baseline.label} → ${newRel.label}` : newRel.label}
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
        {newRel.description}
      </div>

      {newRel.tracks.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: newRel.outcome ? 10 : 0 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", alignSelf: "center", textTransform: "uppercase", letterSpacing: 1 }}>
            Tracking:
          </span>
          {newRel.tracks.map((k) => (
            <span
              key={k}
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                fontSize: 11,
                background: "rgba(218,165,32,0.15)",
                color: "#DAA520",
                border: "1px solid rgba(218,165,32,0.3)",
              }}
            >
              {labelForKey[k] ?? k}
            </span>
          ))}
        </div>
      )}

      {newRel.outcome && (
        <div
          style={{
            marginTop: 6,
            padding: "8px 10px",
            background: "rgba(53,144,51,0.1)",
            border: "1px solid rgba(53,144,51,0.3)",
            borderRadius: 6,
            fontSize: 12,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          <strong style={{ color: "#359033" }}>Outcome:</strong> {newRel.outcome}
        </div>
      )}
    </div>
  );
}
