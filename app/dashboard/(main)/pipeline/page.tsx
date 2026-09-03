// Pipeline — one view of every idea from capture through shipped.
//
// Server component: reads all Ideas from Firestore, groups them by
// status column, hands off to the client component for the kanban
// render + edit interactions.
//
// Data model + column definitions live in lib/pipeline/types.ts.
// Ground truth is Firestore Ideas collection. The legacy markdown
// file (KESHAH-Mobile-App/ACTIVATION_PROPOSALS.md) is now archived —
// don't edit it going forward, use this page.

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import PipelineClient from "./PipelineClient";
import { docToIdea } from "@/lib/pipeline/types";
import { PIPELINE_METRICS } from "@/lib/pipeline/metrics";
import {
  MOBILE_RELEASES_INC_INFLIGHT,
  getInFlightRelease,
} from "@/lib/release-history";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection("Ideas")
    .orderBy("original_proposal_number", "asc")
    .get();

  const ideas = snap.docs.map((d) =>
    docToIdea(d.id, d.data() as Parameters<typeof docToIdea>[1]),
  );

  // Deliberately narrow — Aadi's call. Just the four metrics that
  // ideas should be trying to move right now. See lib/pipeline/metrics.ts
  // if you need to add more.
  const metricOptions: Array<{ key: string; label: string; group: string }> =
    PIPELINE_METRICS.map((m) => ({
      key: m.key,
      label: m.label,
      group: "Target",
    }));

  const inFlight = getInFlightRelease("mobile");
  const versionOptions = MOBILE_RELEASES_INC_INFLIGHT.map((r) => ({
    slug: r.slug,
    label: r.label,
    isInFlight: r.date === null,
  }));

  const stats = {
    total: ideas.length,
    shipped: ideas.filter((i) => i.status === "shipped").length,
    building: ideas.filter((i) => i.status === "building").length,
    inNextRelease: ideas.filter(
      (i) =>
        i.assigned_version && inFlight && i.assigned_version === inFlight.slug,
    ).length,
    parked: ideas.filter((i) => i.status === "parked").length,
  };

  return (
    <div>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "#fff",
              margin: 0,
            }}
          >
            Pipeline
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.5)",
              margin: "4px 0 0",
              maxWidth: 640,
            }}
          >
            Every idea from capture through shipped.{" "}
            {inFlight
              ? `Next release: ${inFlight.label}.`
              : "No in-flight release registered — add one to lib/release-history.ts with date: null."}{" "}
            Ground truth is Firestore; edit via this page.
          </p>
        </div>
      </header>

      <StatStrip stats={stats} />

      <PipelineClient
        initialIdeas={ideas}
        metricOptions={metricOptions}
        versionOptions={versionOptions}
      />
    </div>
  );
}

function StatStrip({
  stats,
}: {
  stats: {
    total: number;
    shipped: number;
    building: number;
    inNextRelease: number;
    parked: number;
  };
}) {
  const items = [
    { label: "Total", value: stats.total, tone: "neutral" as const },
    {
      label: "In next release",
      value: stats.inNextRelease,
      tone: "accent" as const,
    },
    { label: "Building", value: stats.building, tone: "accent" as const },
    { label: "Done", value: stats.shipped, tone: "good" as const },
    { label: "Parked", value: stats.parked, tone: "muted" as const },
  ];
  const colorFor = (tone: "neutral" | "accent" | "good" | "muted") => {
    if (tone === "accent") return "#DAA520";
    if (tone === "good") return "#5AB758";
    if (tone === "muted") return "rgba(255,255,255,0.5)";
    return "#fff";
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 1,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.08)",
        marginBottom: 24,
      }}
    >
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            background: "#0a0a0a",
            padding: "14px 16px",
            display: "grid",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: colorFor(it.tone),
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {it.value}
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            {it.label}
          </div>
        </div>
      ))}
    </div>
  );
}
