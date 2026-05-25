"use client";

import { useState } from "react";

export type CardData = {
  userId: string;
  profile: {
    email: string | null;
    firstName: string | null;
    gender: string | null;
    treatmentStage: string | null;
    daysIntoProgram: number | null;
    region: "US" | "IN" | "OTHER" | null;
    plan: string | null;
  };
  recentMessages: { fromId: string; content: string; timestampMs: number | null }[];
  lastUpdateMs: number | null;
  draft: { content: string; category: string; generatedAtMs: number } | null;
};

type CardState = "idle" | "sending" | "skipping" | "regenerating" | "sent" | "skipped" | "error";

const CATEGORY_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  answerable:     { bg: "rgba(80,200,120,0.15)",  fg: "#7be3a0", label: "Answerable" },
  investigation:  { bg: "rgba(255,180,80,0.15)",  fg: "#ffc068", label: "Investigation" },
  account_change: { bg: "rgba(255,140,180,0.15)", fg: "#ff9ec3", label: "Account change" },
  medical:        { bg: "rgba(255,100,100,0.15)", fg: "#ff8585", label: "Medical — caution" },
  thanks:         { bg: "rgba(140,180,255,0.15)", fg: "#a8c2ff", label: "Thanks" },
};

function formatRelative(ms: number | null): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SupportReviewClient({ initialCards }: { initialCards: CardData[] }) {
  const [cards, setCards] = useState<CardData[]>(initialCards);
  const [editedDrafts, setEditedDrafts] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, CardState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setCardState(userId: string, state: CardState, error?: string) {
    setStates((prev) => ({ ...prev, [userId]: state }));
    if (error) setErrors((prev) => ({ ...prev, [userId]: error }));
  }

  function removeCard(userId: string) {
    setCards((prev) => prev.filter((c) => c.userId !== userId));
  }

  async function send(card: CardData) {
    const content = (editedDrafts[card.userId] ?? card.draft?.content ?? "").trim();
    if (!content) return;
    setCardState(card.userId, "sending");
    try {
      const res = await fetch("/api/support/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: card.userId, content }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCardState(card.userId, "sent");
      setTimeout(() => removeCard(card.userId), 800);
    } catch (e) {
      setCardState(card.userId, "error", e instanceof Error ? e.message : "send failed");
    }
  }

  async function skip(card: CardData) {
    setCardState(card.userId, "skipping");
    try {
      const res = await fetch("/api/support/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: card.userId, hours: 24 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCardState(card.userId, "skipped");
      setTimeout(() => removeCard(card.userId), 600);
    } catch (e) {
      setCardState(card.userId, "error", e instanceof Error ? e.message : "skip failed");
    }
  }

  async function regenerate(card: CardData) {
    setCardState(card.userId, "regenerating");
    try {
      const res = await fetch("/api/support/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: card.userId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { draft: { content: string; category: string } };
      setCards((prev) =>
        prev.map((c) =>
          c.userId === card.userId
            ? { ...c, draft: { content: data.draft.content, category: data.draft.category, generatedAtMs: Date.now() } }
            : c
        )
      );
      setEditedDrafts((prev) => {
        const next = { ...prev };
        delete next[card.userId];
        return next;
      });
      setCardState(card.userId, "idle");
    } catch (e) {
      setCardState(card.userId, "error", e instanceof Error ? e.message : "regenerate failed");
    }
  }

  if (cards.length === 0) {
    return (
      <div style={{
        padding: 40,
        textAlign: "center",
        color: "rgba(255,255,255,0.5)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        background: "rgba(255,255,255,0.02)",
      }}>
        <p style={{ margin: 0, fontSize: 14 }}>Inbox is clear. Nothing waiting.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {cards.map((card) => {
        const state = states[card.userId] ?? "idle";
        const draftText = editedDrafts[card.userId] ?? card.draft?.content ?? "";
        const cat = card.draft?.category && CATEGORY_COLORS[card.draft.category];
        const profileBits = [
          card.profile.firstName,
          card.profile.gender,
          card.profile.treatmentStage,
          typeof card.profile.daysIntoProgram === "number" ? `day ${card.profile.daysIntoProgram}` : null,
          card.profile.region,
          card.profile.plan,
        ].filter(Boolean).join(" · ");

        return (
          <article key={card.userId} style={{
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            background: "rgba(255,255,255,0.02)",
            padding: 16,
            opacity: state === "sent" || state === "skipped" ? 0.4 : 1,
            transition: "opacity 0.3s",
          }}>
            {/* Header: who + when */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {card.profile.email ?? card.userId}
                </div>
                {profileBits && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                    {profileBits}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                {formatRelative(card.lastUpdateMs)}
              </div>
            </div>

            {/* Recent messages */}
            <div style={{
              background: "rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.04)",
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 13,
              lineHeight: 1.45,
            }}>
              {card.recentMessages.length === 0 ? (
                <p style={{ color: "rgba(255,255,255,0.4)", margin: 0 }}>(no prior messages)</p>
              ) : (
                card.recentMessages.map((m, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      color: m.fromId === "0" ? "#7be3a0" : "rgba(255,255,255,0.5)",
                    }}>
                      {m.fromId === "0" ? "Aadi" : "User"}
                    </span>
                    <span style={{ color: m.fromId === "0" ? "rgba(255,255,255,0.7)" : "#fff", whiteSpace: "pre-wrap" }}>
                      {m.content}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Draft + category */}
            {card.draft ? (
              <>
                {cat && (
                  <div style={{
                    display: "inline-block",
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.3px",
                    background: cat.bg,
                    color: cat.fg,
                    marginBottom: 8,
                  }}>
                    {cat.label}
                  </div>
                )}
                <textarea
                  value={draftText}
                  onChange={(e) => setEditedDrafts((prev) => ({ ...prev, [card.userId]: e.target.value }))}
                  rows={5}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: "rgba(0,0,0,0.5)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 14,
                    lineHeight: 1.5,
                    padding: 12,
                    fontFamily: "inherit",
                    resize: "vertical",
                    marginBottom: 10,
                  }}
                />
              </>
            ) : (
              <div style={{
                padding: 12,
                background: "rgba(255,255,255,0.03)",
                border: "1px dashed rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 12,
                color: "rgba(255,255,255,0.4)",
                marginBottom: 10,
              }}>
                No draft yet. Hit Regenerate to create one.
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => send(card)}
                disabled={state !== "idle" || !draftText.trim()}
                style={{
                  flex: "1 1 120px",
                  padding: "12px 16px",
                  background: state === "sending" ? "rgba(80,200,120,0.4)" : "#3aa860",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: state === "idle" && draftText.trim() ? "pointer" : "not-allowed",
                  opacity: state === "idle" && draftText.trim() ? 1 : 0.5,
                  minHeight: 44,
                }}
              >
                {state === "sending" ? "Sending..." : state === "sent" ? "Sent ✓" : "Send"}
              </button>
              <button
                onClick={() => regenerate(card)}
                disabled={state !== "idle"}
                style={{
                  flex: "1 1 110px",
                  padding: "12px 16px",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: state === "idle" ? "pointer" : "not-allowed",
                  opacity: state === "idle" ? 1 : 0.5,
                  minHeight: 44,
                }}
              >
                {state === "regenerating" ? "Drafting..." : "Regenerate"}
              </button>
              <button
                onClick={() => skip(card)}
                disabled={state !== "idle"}
                style={{
                  flex: "1 1 90px",
                  padding: "12px 16px",
                  background: "transparent",
                  color: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: state === "idle" ? "pointer" : "not-allowed",
                  opacity: state === "idle" ? 1 : 0.5,
                  minHeight: 44,
                }}
              >
                {state === "skipping" ? "..." : state === "skipped" ? "Skipped" : "Skip 24h"}
              </button>
            </div>

            {state === "error" && errors[card.userId] && (
              <p style={{ marginTop: 8, fontSize: 12, color: "#ff8585" }}>
                Error: {errors[card.userId]}. Try again?
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
