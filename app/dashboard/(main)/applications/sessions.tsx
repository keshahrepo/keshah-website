"use client";

// Group-interview sessions for the Recruit tab:
//   - SessionsPanel: create a session, copy its link, show a QR, open/close
//   - SessionLiveView (?session=<slug>): "X / Y submitted", auto-refreshing
//     every 5s, with watch-video + accept/deny per applicant.

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export type SessionRow = {
  id: string;
  listing_slug: string | null;
  full_name: string | null;
  email: string | null;
  gender: string | null;
  status: string;
  source: string | null;
  opened_at: string | null;
  submitted_at: string | null;
  has_video: boolean;
  followup_1_sent_at: string | null;
  followup_2_sent_at: string | null;
  link_closed_at: string | null;
  reminder_24h_sent_at?: string | null;
  reminder_1h_sent_at?: string | null;
  reminder_now_sent_at?: string | null;
  reminder_now_text_sent_at?: string | null;
  noshow_email_sent_at?: string | null;
  noshow_text_sent_at?: string | null;
  reminder_1h_text_sent_at?: string | null;
  checked_in_at?: string | null;
  confirmed_at?: string | null;
  booking_text_sent_at?: string | null;
};

type SessionMeta = {
  slug: string;
  title: string;
  starts_at: string;
  follow_up_hours: number;
  is_open: boolean;
  url: string;
};

const card: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  background: "rgba(255,255,255,0.02)",
  padding: 16,
};
const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.4)",
  fontWeight: 600,
};
const input: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  fontFamily: "inherit",
  fontSize: 13,
  colorScheme: "dark",
};
function pill(active = false, color = "rgba(255,255,255,0.85)"): React.CSSProperties {
  return {
    padding: "7px 12px",
    borderRadius: 999,
    border: `1px solid ${active ? "#fff" : "rgba(255,255,255,0.16)"}`,
    background: active ? "#fff" : "transparent",
    color: active ? "#000" : color,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "inherit",
    fontWeight: 500,
    whiteSpace: "nowrap",
  };
}

function fmt(iso: string | null, withDay = false) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    ...(withDay ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Badge({ text, title, tone }: { text: string; title?: string; tone?: "green" }) {
  return (
    <span
      title={title}
      style={{
        fontSize: 10.5,
        padding: "2px 7px",
        borderRadius: 999,
        border: `1px solid ${tone === "green" ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.14)"}`,
        color: tone === "green" ? "#4ade80" : "rgba(255,255,255,0.6)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function rowBadges(r: SessionRow): { text: string; title: string; tone?: "green" }[] {
  const out: { text: string; title: string; tone?: "green" }[] = [];
  if (r.checked_in_at) out.push({ text: "Checked in", title: `Replied to the 1h text ${fmt(r.checked_in_at)}`, tone: "green" });
  else if (r.confirmed_at) out.push({ text: "Confirmed", title: `Replied to the booking text ${fmt(r.confirmed_at)}`, tone: "green" });
  if (r.booking_text_sent_at) out.push({ text: "Booking text", title: `Booking text sent ${fmt(r.booking_text_sent_at)}` });
  if (r.reminder_24h_sent_at) out.push({ text: "24h reminder", title: `24h reminder sent ${fmt(r.reminder_24h_sent_at)}` });
  if (r.reminder_1h_sent_at)
    out.push({
      text: r.reminder_1h_text_sent_at ? "1h text" : "1h reminder",
      title: `1h reminder sent ${fmt(r.reminder_1h_sent_at)}`,
    });
  if (r.reminder_now_sent_at)
    out.push({
      text: r.reminder_now_text_sent_at ? "Starting-now email + text" : "Starting-now email",
      title: `Starting-now reminder sent ${fmt(r.reminder_now_sent_at)}`,
    });
  if (r.noshow_email_sent_at)
    out.push({
      text: r.noshow_text_sent_at ? "No-show email + text" : "No-show email sent",
      title: `"Sorry we missed you" sent ${fmt(r.noshow_email_sent_at)}`,
    });
  return out;
}

function RecordingLinkField() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/interview/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { interview_recording_url?: string }) => {
        setValue(b.interview_recording_url ?? "");
        setSaved(b.interview_recording_url ?? "");
      })
      .catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/interview/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interview_recording_url: value.trim() }),
      });
      const b = (await res.json()) as { interview_recording_url?: string; error?: string };
      if (!res.ok) throw new Error(b.error || `HTTP ${res.status}`);
      setSaved(b.interview_recording_url ?? "");
      setValue(b.interview_recording_url ?? "");
      setMsg("Saved");
      setTimeout(() => setMsg(null), 1500);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 220 }}>
        <span style={label}>Presentation recording link</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://… (sent to no-shows, leave empty to skip)"
          style={input}
        />
      </label>
      <button type="button" onClick={save} disabled={busy || value.trim() === saved} style={{ ...pill(true), padding: "9px 14px" }}>
        {busy ? "Saving…" : "Save"}
      </button>
      {msg && <span style={{ fontSize: 12, color: msg === "Saved" ? "#4ade80" : "#F26B4C" }}>{msg}</span>}
    </div>
  );
}

function CopyButton({ text, labelText = "Copy link" }: { text: string; labelText?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      style={pill()}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Copy this link", text);
        }
      }}
    >
      {done ? "Copied" : labelText}
    </button>
  );
}

function QrBox({ url }: { url: string }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
      <div style={{ background: "#fff", padding: 12, borderRadius: 10, lineHeight: 0 }}>
        <QRCodeSVG value={url} size={180} level="M" />
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", maxWidth: 260 }}>
        The interview deck already shows this QR on the video test slide, so there&apos;s nothing to update. Scanning it opens <br />
        <span style={{ color: "#fff" }}>{url}</span>
      </div>
    </div>
  );
}

// ── Sessions panel ───────────────────────────────────────────────────
export function SessionsPanel({ onOpenSession }: { onOpenSession: (slug: string) => void }) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [liveUrl, setLiveUrl] = useState("https://www.keshah.com/interview/live");
  const [expanded, setExpanded] = useState(false);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/interview/sessions", { cache: "no-store" });
      const body = (await res.json()) as { sessions?: SessionMeta[]; live_url?: string; error?: string };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setSessions(body.sessions ?? []);
      if (body.live_url) setLiveUrl(body.live_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!startsAt) {
      setError("Pick a date and time.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // datetime-local is the admin's local time; send as a real instant.
          starts_at: new Date(startsAt).toISOString(),
          tz_offset_min: new Date(startsAt).getTimezoneOffset(),
          title: title.trim() || undefined,
          slug: slug.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { session?: { slug: string }; error?: string };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setStartsAt("");
      setTitle("");
      setSlug("");
      await load();
      if (body.session) setQrFor(body.session.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleOpen(s: SessionMeta) {
    setSessions((ss) => ss.map((x) => (x.slug === s.slug ? { ...x, is_open: !s.is_open } : x)));
    const res = await fetch(`/api/interview/sessions/${s.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_open: !s.is_open }),
    });
    if (!res.ok) {
      alert(`Couldn't update: HTTP ${res.status}`);
      load();
    }
  }

  const upcoming = sessions.filter((s) => s.is_open);
  const visible = expanded ? sessions : upcoming.slice(0, 3);

  return (
    <section style={{ ...card, marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Group interview video test</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
            The live link always points to the current open session, so the slide QR never changes.
          </div>
        </div>
        <CopyButton text={liveUrl} labelText="Copy live link" />
        <button type="button" style={pill(qrFor === "live")} onClick={() => setQrFor((q) => (q === "live" ? null : "live"))}>
          Live QR
        </button>
      </div>
      {qrFor === "live" && <QrBox url={liveUrl} />}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Always-open video link</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
            For anyone who couldn&apos;t film on the call, or applicants you&apos;re not inviting to a group interview. It never closes. Their video shows on their application (Watch video).
          </div>
        </div>
        <button type="button" style={pill(true)} onClick={() => onOpenSession("video")}>
          See responses
        </button>
        <CopyButton text="https://www.keshah.com/interview/video" labelText="Copy video link" />
      </div>
      <RecordingLinkField />

      {/* Create */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={label}>Starts at</span>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={input} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={label}>Title (optional)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Group interview" style={input} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={label}>Slug (optional)</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto, e.g. oct-7" style={{ ...input, width: 140 }} />
        </label>
        <button type="button" onClick={create} disabled={busy} style={{ ...pill(true), padding: "9px 14px" }}>
          {busy ? "Creating…" : "Create session"}
        </button>
      </div>
      {error && <div style={{ color: "#F26B4C", fontSize: 12, marginTop: 8 }}>{error}</div>}

      {/* List */}
      {visible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {visible.map((s) => (
            <div key={s.slug} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {s.title}{" "}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        marginLeft: 6,
                        color: s.is_open ? "#4ade80" : "rgba(255,255,255,0.4)",
                      }}
                    >
                      {s.is_open ? "Open" : "Closed"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                    {fmt(s.starts_at, true)} · /interview/{s.slug}
                  </div>
                </div>
                <button type="button" style={pill(true)} onClick={() => onOpenSession(s.slug)}>
                  Live view
                </button>
                <CopyButton text={s.url} />
                <button type="button" style={pill(qrFor === s.slug)} onClick={() => setQrFor((q) => (q === s.slug ? null : s.slug))}>
                  QR
                </button>
                <button type="button" style={pill(false, s.is_open ? "#F26B4C" : "#4ade80")} onClick={() => toggleOpen(s)}>
                  {s.is_open ? "Close" : "Reopen"}
                </button>
              </div>
              {qrFor === s.slug && <QrBox url={s.url} />}
            </div>
          ))}
        </div>
      )}
      {sessions.length > visible.length || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          style={{ ...pill(), marginTop: 12, border: 0, padding: 0, color: "rgba(255,255,255,0.55)" }}
        >
          {expanded ? "Show fewer" : `Show all sessions (${sessions.length})`}
        </button>
      ) : null}
    </section>
  );
}

// ── Live view ────────────────────────────────────────────────────────
export function SessionLiveView({
  slug,
  onBack,
  onStatus,
}: {
  slug: string;
  onBack: () => void;
  onStatus: (row: SessionRow, status: "accepted" | "denied" | "booked") => Promise<void>;
}) {
  const [session, setSession] = useState<SessionMeta | null>(null);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [counts, setCounts] = useState({ total: 0, submitted: 0 });
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/interview/sessions/${encodeURIComponent(slug)}`, { cache: "no-store" });
      const body = (await res.json()) as {
        session?: SessionMeta;
        rows?: SessionRow[];
        total?: number;
        submitted?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setSession(body.session ?? null);
      setRows(body.rows ?? []);
      setCounts({ total: body.total ?? 0, submitted: body.submitted ?? 0 });
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [slug]);

  useEffect(() => {
    load();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);
    return () => window.clearInterval(t);
  }, [load]);

  async function watch(row: SessionRow) {
    // Open the tab synchronously so popup blockers allow it, then point it
    // at the signed URL once we have it.
    const w = window.open("about:blank", "_blank");
    try {
      const res = await fetch(`/api/careers/${row.id}/video-url`, { cache: "no-store" });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error || `HTTP ${res.status}`);
      if (w) w.location.href = body.url;
      else window.location.href = body.url;
    } catch (e) {
      w?.close();
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function setStatus(row: SessionRow, status: "accepted" | "denied" | "booked") {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status } : r)));
    await onStatus(row, status);
    load();
  }

  const pct = counts.total ? Math.round((counts.submitted / counts.total) * 100) : 0;

  return (
    <div>
      <button type="button" onClick={onBack} style={{ ...pill(), marginBottom: 16 }}>
        ← All applications
      </button>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={label}>{session ? fmt(session.starts_at, true) : slug}</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{session?.title ?? slug}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              {session?.url}
              {session && !session.is_open && <span style={{ color: "#F26B4C" }}> · Closed</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1 }}>
              {counts.submitted}
              <span style={{ color: "rgba(255,255,255,0.35)" }}> / {counts.total}</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>submitted</div>
          </div>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: 14, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#4ade80", transition: "width 400ms ease" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          {session && <CopyButton text={session.url} />}
          <button type="button" style={pill(showQr)} onClick={() => setShowQr((x) => !x)}>
            QR
          </button>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: "auto" }}>
            {error ? <span style={{ color: "#F26B4C" }}>Error: {error}</span> : updatedAt ? `Updated ${updatedAt.toLocaleTimeString()} · refreshes every 5s` : "Loading…"}
          </span>
        </div>
        {showQr && session && <QrBox url={session.url} />}
      </div>

      {rows.length === 0 && !error && (
        <div style={{ border: "1px dashed rgba(255,255,255,0.14)", borderRadius: 12, padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          No one in this session yet. People show up here when they book this slot or open the link.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              ...card,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              borderColor: r.submitted_at ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.1)",
            }}
          >
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {r.full_name ?? "(no name)"}
                {r.source === "group_interview" && (
                  <span style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", marginLeft: 8 }}>new at interview</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                {r.email ?? "—"}
                {r.gender ? ` · ${r.gender}` : ""}
              </div>
            </div>
            <div style={{ fontSize: 12, minWidth: 150, color: r.submitted_at ? "#4ade80" : "rgba(255,255,255,0.5)" }}>
              {r.submitted_at
                ? `Submitted ${fmt(r.submitted_at)}`
                : r.link_closed_at
                ? "Link closed, no video"
                : r.opened_at
                ? `Opened ${fmt(r.opened_at)}`
                : "Hasn't opened link"}
              {!r.submitted_at && (r.followup_1_sent_at || r.followup_2_sent_at) && (
                <div style={{ color: "rgba(255,255,255,0.4)" }}>
                  {r.followup_2_sent_at ? "Reminder sent" : "Follow-up sent"}
                </div>
              )}
              {rowBadges(r).length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  {rowBadges(r).map((b) => (
                    <Badge key={b.text} text={b.text} title={b.title} tone={b.tone} />
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {r.has_video && (
                <button type="button" style={pill(true)} onClick={() => watch(r)}>
                  Watch video
                </button>
              )}
              {r.status === "accepted" || r.status === "denied" ? (
                <>
                  <span style={{ fontSize: 12, color: r.status === "accepted" ? "#4CAF50" : "#F26B4C", textTransform: "capitalize" }}>
                    {r.status}
                  </span>
                  <button type="button" style={pill()} onClick={() => setStatus(r, "booked")}>
                    Reopen
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    style={{ ...pill(), background: "#4CAF50", border: 0, color: "#fff" }}
                    onClick={() => setStatus(r, "accepted")}
                    disabled={!r.email}
                  >
                    Accept → Gmail
                  </button>
                  <button type="button" style={pill(false, "#F26B4C")} onClick={() => setStatus(r, "denied")}>
                    Deny
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
