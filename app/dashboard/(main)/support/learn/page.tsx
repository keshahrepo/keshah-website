import { listProposals } from "@/lib/support/proposals";
import { getActivePrompts } from "@/lib/support/prompts";
import LearnClient from "./LearnClient";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const [pending, prompts] = await Promise.all([
    listProposals("pending"),
    getActivePrompts(),
  ]);

  const initial = pending.map((p) => ({
    id: p.id,
    target: p.target,
    summary: p.summary,
    rationale: p.rationale,
    patchType: p.patchType,
    proposedText: p.proposedText,
    supportingPairIds: p.supportingPairIds,
    numPairsAnalyzed: p.numPairsAnalyzed,
    createdAtMs: p.createdAt?.toMillis() ?? 0,
  }));

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>Support draft — learning</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
          {initial.length} pending proposal{initial.length === 1 ? "" : "s"} · prompts version {prompts.version}
        </p>
      </header>
      <LearnClient
        initial={initial}
        currentPrompts={{
          voiceRules: prompts.voiceRules,
          canonicalAnswers: prompts.canonicalAnswers,
          categoryRules: prompts.categoryRules,
        }}
      />
    </div>
  );
}
