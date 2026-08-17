"use client";

import { useState } from "react";

type Proposal = {
  id: string;
  target: "voiceRules" | "canonicalAnswers" | "categoryRules";
  summary: string;
  rationale: string;
  patchType: "append" | "replace";
  proposedText: string;
  supportingPairIds: string[];
  numPairsAnalyzed: number;
  createdAtMs: number;
};

type Props = {
  initial: Proposal[];
  currentPrompts: { voiceRules: string; canonicalAnswers: string; categoryRules: string };
};

const TARGET_LABEL: Record<Proposal["target"], string> = {
  voiceRules: "Voice rules",
  canonicalAnswers: "Canonical answers",
  categoryRules: "Category rules",
};

export default function LearnClient({ initial, currentPrompts }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>(initial);
  const [busy, setBusy] = useState<Record<string, "approve" | "reject" | null>>({});
  const [error, setError] = useState<Record<string, string | null>>({});

  async function act(id: string, action: "approve" | "reject") {
    setBusy((b) => ({ ...b, [id]: action }));
    setError((e) => ({ ...e, [id]: null }));
    try {
      const res = await fetch("/api/support/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setProposals((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      setError((er) => ({ ...er, [id]: e instanceof Error ? e.message : "failed" }));
    } finally {
      setBusy((b) => ({ ...b, [id]: null }));
    }
  }

  if (proposals.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.5)", border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 12 }}>
        No pending proposals. The daily learning cron analyzes Aadi's edits at 6am UTC.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {proposals.map((p) => {
        const isBusy = !!busy[p.id];
        const err = error[p.id];
        const currentFull = currentPrompts[p.target];
        return (
          <div key={p.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={chip}>{TARGET_LABEL[p.target]}</span>
                  <span style={chipDim}>{p.patchType}</span>
                  <span style={chipDim}>{p.numPairsAnalyzed} pairs analyzed</span>
                  <span style={chipDim}>{p.supportingPairIds.length} citations</span>
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: "0 0 6px" }}>{p.summary}</h2>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.5 }}>{p.rationale}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => act(p.id, "approve")} disabled={isBusy} style={btnPrimary}>{busy[p.id] === "approve" ? "..." : "Approve"}</button>
                <button onClick={() => act(p.id, "reject")} disabled={isBusy} style={btnGhost}>{busy[p.id] === "reject" ? "..." : "Reject"}</button>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={sectionLabel}>{p.patchType === "append" ? "Will append to current" : "Will replace current"}</div>
                <pre style={preCurrent}>{currentFull}</pre>
              </div>
              <div>
                <div style={sectionLabel}>{p.patchType === "append" ? "New addition" : "New full text"}</div>
                <pre style={preProposed}>{p.proposedText}</pre>
              </div>
            </div>

            {err && <div style={{ marginTop: 8, fontSize: 12, color: "#ff8888" }}>Error: {err}</div>}
          </div>
        );
      })}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 16,
};
const chip: React.CSSProperties = {
  background: "rgba(120, 200, 255, 0.15)",
  color: "#9cd9ff",
  border: "1px solid rgba(120, 200, 255, 0.3)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  padding: "2px 8px",
  borderRadius: 999,
  fontWeight: 600,
};
const chipDim: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.6)",
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
};
const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 6,
};
const preCurrent: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 8,
  padding: 10,
  fontSize: 12,
  color: "rgba(255,255,255,0.7)",
  whiteSpace: "pre-wrap",
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  maxHeight: 240,
  overflow: "auto",
  margin: 0,
};
const preProposed: React.CSSProperties = {
  background: "rgba(120, 220, 150, 0.06)",
  border: "1px solid rgba(120, 220, 150, 0.2)",
  borderRadius: 8,
  padding: 10,
  fontSize: 12,
  color: "#c5f0d0",
  whiteSpace: "pre-wrap",
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  maxHeight: 240,
  overflow: "auto",
  margin: 0,
};
const btnPrimary: React.CSSProperties = {
  background: "#3b82f6",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "rgba(255,255,255,0.7)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};
