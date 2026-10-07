"use client";

// Applicant text inbox for the Recruit tab. Replies come in through the
// HiBlue webhook (synced every minute by the reminders cron, and on load
// here). Only applicants show up; paywall outreach to app users never does.

import { useCallback, useEffect, useRef, useState } from "react";

export type InboxConversation = {
  application_id: string;
  name: string | null;
  status: string | null;
  phone: string | null;
  last_text: string;
  last_direction: "in" | "out";
  last_at: string | null;
  unread: number;
  has_inbound: boolean;
};

type ThreadMessage = {
  id: string;
  direction: "in" | "out";
  text: string;
  attachments: string[];
  at: string | null;
  read: boolean;
  kind: string | null;
};

const MUTED = "rgba(255,255,255,0.5)";
const BORDER = "1px solid rgba(255,255,255,0.1)";

/** Conversations + unread total. Syncs new replies on first load. */
export function useInbox() {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (sync = true) => {
    try {
      const res = await fetch(`/api/careers/inbox${sync ? "" : "?sync=0"}`, { cache: "no-store" });
      const body = (await res.json()) as { conversations?: InboxConversation[]; unread_total?: number; error?: string };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setConversations(body.conversations ?? []);
      setUnread(body.unread_total ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    // The cron pulls replies in every minute; just re-read.
    const t = setInterval(() => load(false), 60_000);
    return () => clearInterval(t);
  }, [load]);

  return { conversations, unread, error, loading, reload: load };
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      style={{
        marginLeft: 6,
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 999,
        background: "#F26B4C",
        color: "#fff",
        fontSize: 11,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
      }}
    >
      {count}
    </span>
  );
}

export function InboxPanel({
  conversations,
  loading,
  error,
  onChanged,
}: {
  conversations: InboxConversation[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = conversations.find((c) => c.application_id === openId) ?? null;

  if (open) {
    return (
      <div style={{ border: BORDER, borderRadius: 12, background: "rgba(255,255,255,0.02)", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => {
              setOpenId(null);
              onChanged();
            }}
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.16)", color: "rgba(255,255,255,0.75)", borderRadius: 999, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
          >
            ‹ All messages
          </button>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{open.name ?? "(no name)"}</div>
            <div style={{ color: MUTED, fontSize: 12 }}>
              {[open.phone, open.status].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        <Thread applicationId={open.application_id} onRead={onChanged} />
      </div>
    );
  }

  if (loading) return <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>;
  return (
    <div>
      {error && <div style={{ color: "#F26B4C", fontSize: 13, marginBottom: 8 }}>Error: {error}</div>}
      {conversations.length === 0 ? (
        <div style={{ border: "1px dashed rgba(255,255,255,0.14)", borderRadius: 12, padding: 40, textAlign: "center", color: MUTED, fontSize: 13 }}>
          No texts with applicants yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {conversations.map((c) => (
            <button
              key={c.application_id}
              type="button"
              onClick={() => setOpenId(c.application_id)}
              style={{
                border: BORDER,
                borderRadius: 12,
                background: c.unread ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                color: "#fff",
                padding: "12px 16px",
                display: "grid",
                gridTemplateColumns: "12px 1fr auto",
                gap: 12,
                alignItems: "center",
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
              }}
            >
              <span
                aria-label={c.unread ? "Unread" : undefined}
                style={{ width: 8, height: 8, borderRadius: 999, background: c.unread ? "#F26B4C" : "transparent" }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: c.unread ? 700 : 600 }}>
                  {c.name ?? "(no name)"}
                  {c.unread > 1 && <span style={{ color: MUTED, fontWeight: 400, marginLeft: 6, fontSize: 12 }}>{c.unread} new</span>}
                </div>
                <div style={{ color: c.unread ? "rgba(255,255,255,0.85)" : MUTED, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.last_direction === "out" ? "You: " : ""}
                  {c.last_text}
                </div>
              </div>
              <div style={{ color: MUTED, fontSize: 12, whiteSpace: "nowrap" }}>{fmtTime(c.last_at)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  interview_1h: "1h text",
  interview_start: "Start-time text",
  interview_noshow: "No-show text",
  checkin_reply: "Check-in reply",
};

/** One applicant's thread: ours on the right. Marks it read when opened. */
export function Thread({ applicationId, onRead, compact }: { applicationId: string; onRead?: () => void; compact?: boolean }) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  // Held in a ref so a new callback from the parent doesn't refetch the thread.
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/careers/inbox/${encodeURIComponent(applicationId)}`, { cache: "no-store" });
      const body = (await res.json()) as { messages?: ThreadMessage[]; error?: string };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const msgs = body.messages ?? [];
      setMessages(msgs);
      setError(null);
      if (msgs.some((m) => m.direction === "in" && !m.read)) {
        await fetch(`/api/careers/inbox/${encodeURIComponent(applicationId)}/read`, { method: "POST" }).catch(() => {});
        onReadRef.current?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [applicationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!compact) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, compact]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/careers/inbox/${encodeURIComponent(applicationId)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setDraft("");
      await load();
      onReadRef.current?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {error && <div style={{ color: "#F26B4C", fontSize: 13 }}>Error: {error}</div>}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxHeight: compact ? 280 : 480,
          overflowY: "auto",
          padding: "4px 2px",
        }}
      >
        {messages === null && !error && <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>}
        {messages?.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No texts yet.</div>}
        {messages?.map((m) => {
          const ours = m.direction === "out";
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: ours ? "flex-end" : "flex-start" }}>
              <div
                style={{
                  maxWidth: "75%",
                  padding: "8px 12px",
                  borderRadius: 14,
                  borderBottomRightRadius: ours ? 4 : 14,
                  borderBottomLeftRadius: ours ? 14 : 4,
                  background: ours ? "#fff" : "rgba(255,255,255,0.08)",
                  color: ours ? "#000" : "#fff",
                  fontSize: 13,
                  lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {m.text}
                {m.attachments.map((a, i) => (
                  <div key={i} style={{ marginTop: 4 }}>
                    <a href={a} target="_blank" rel="noopener noreferrer" style={{ color: ours ? "#000" : "#4ade80", fontSize: 12, textDecoration: "underline" }}>
                      Attachment {m.attachments.length > 1 ? i + 1 : ""}
                    </a>
                  </div>
                ))}
              </div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10.5, marginTop: 3 }}>
                {fmtTime(m.at)}
                {ours && m.kind && KIND_LABEL[m.kind] ? ` · ${KIND_LABEL[m.kind]}` : ""}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Text back from McKenzie's line…"
          rows={2}
          maxLength={1000}
          style={{
            flex: 1,
            resize: "vertical",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 10,
            color: "#fff",
            padding: "8px 10px",
            fontFamily: "inherit",
            fontSize: 13,
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !draft.trim()}
          style={{
            padding: "10px 16px",
            background: "#fff",
            color: "#000",
            border: 0,
            borderRadius: 8,
            cursor: sending || !draft.trim() ? "default" : "pointer",
            opacity: sending || !draft.trim() ? 0.5 : 1,
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
