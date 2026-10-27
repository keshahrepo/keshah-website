"use client";

// Admin Recruit tab — inbound applications from the careers site.
// Five status buckets:
//   Pending — draft, user didn't finish the quiz
//   Awaiting booking — finished the quiz, reached the Calendly step,
//                      but Calendly hasn't confirmed a booking yet
//   Booked — Calendly webhook confirmed a slot; ready for interview
//   Accepted / Denied — post-interview decision
//
// Row expand shows all form answers + Calendly booking details.
// Accept opens Gmail's compose window pre-filled with the offer email
// + contract link. Deny emails a short "not moving forward" note to
// applicants who sent their video test; no-shows get nothing.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SessionLiveView, SessionsPanel } from "./sessions";
import { InboxPanel, Thread, UnreadBadge, useInbox } from "./inbox";

// Public URL of the contract PDF applicants get linked to. Drop the
// file at /public/careers/paid-creator-intern-contract.pdf and this
// link starts working. Until then the acceptance email still sends;
// the link 404s until you upload the PDF.
const CONTRACT_URL_BY_SLUG: Record<string, string> = {
  "paid-creator-intern":
    "https://keshah.com/careers/paid-creator-intern-contract.pdf",
};

const TAB_LABELS: Record<TabKey, string> = {
  pending: "Pending",
  awaiting_booking: "Awaiting booking",
  booked: "Booked",
  accepted: "Accepted",
  denied: "Denied",
};

type TabKey =
  | "pending"
  | "awaiting_booking"
  | "booked"
  | "accepted"
  | "denied";

type Application = {
  id: string;
  listing_slug: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  gender: string | null;
  college: string | null;
  outside_us_timezone?: string | null;
  graduation_year: string | null;
  can_commit: string | null;
  comfortable_on_camera: string | null;
  wants_virality: string | null;
  posted_before: string | null;
  social_handle: string | null;
  calendly_event_start_time: string | null;
  calendly_join_url: string | null;
  has_video?: boolean;
  has_iphone?: string | null;
  has_us_bank?: string | null;
  denial_email_due?: boolean;
  denied_reason?: string | null;
  interview_session?: string | null;
  interview_video_submitted_at?: string | null;
  calendly_reschedule_url: string | null;
  calendly_cancel_url: string | null;
  status: TabKey;
  created_at: string | null;
  submitted_at: string | null;
  booked_at: string | null;
  last_updated_at: string | null;
  decided_at: string | null;
};

export default function ApplicationsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <ApplicationsInner />
    </Suspense>
  );
}

function ApplicationsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionSlug = params.get("session");
  const [tab, setTab] = useState<TabKey>("booked");
  const [showInbox, setShowInbox] = useState(params.get("inbox") === "1");
  const inbox = useInbox();
  const threadIds = useMemo(() => new Set(inbox.conversations.map((c) => c.application_id)), [inbox.conversations]);
  const reloadInbox = inbox.reload;
  const refreshInbox = useCallback(() => reloadInbox(false), [reloadInbox]);
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/careers/list", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { applications: Application[] };
      setRows(body.applications);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const g: Record<TabKey, Application[]> = {
      pending: [],
      awaiting_booking: [],
      booked: [],
      accepted: [],
      denied: [],
    };
    for (const r of rows) {
      // Legacy "completed" (pre-group-interview flow) folds into
      // awaiting_booking so old rows still show up somewhere sane.
      const raw = (r.status ?? "pending") as string;
      const k = (raw === "completed" ? "awaiting_booking" : raw) as TabKey;
      if (k in g) g[k].push(r);
    }
    return g;
  }, [rows]);

  const visible = grouped[tab];

  async function updateStatus(
    id: string,
    status: "accepted" | "denied" | "booked",
    plan?: AcceptPlan,
  ) {
    // Optimistic — flip locally, then persist. Rollback on failure.
    const prev = rows;
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, status } : r))
    );
    try {
      const res = await fetch(`/api/careers/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(plan ?? {}) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setRows(prev);
    }
  }

  function openGmailAccept(
    row: Pick<Application, "email" | "full_name" | "listing_slug">,
  ) {
    if (!row.email) {
      alert("This application has no email address.");
      return;
    }
    const firstName = (row.full_name ?? "").trim().split(/\s+/)[0] || "there";
    const contractUrl =
      CONTRACT_URL_BY_SLUG[row.listing_slug ?? ""] ??
      "https://keshah.com/careers";
    const subject = `Welcome to KESHAH — Paid Creator Intern`;
    const body =
      `Hi ${firstName},\n\n` +
      `Great news — we'd love to have you join the KESHAH creator team.\n\n` +
      `Your paid two-week trial starts as soon as you sign the agreement below:\n` +
      `${contractUrl}\n\n` +
      `Once you've signed, reply to this email and we'll get you set up with your KESHAH TikTok and Instagram accounts, plus the scripts + references for your first week.\n\n` +
      `Talk soon,\n` +
      `Aadi\n` +
      `Founder, KESHAH`;

    // Gmail compose URL. authuser=contact@keshah.com is a hint so if
    // the browser has multiple Google accounts, it opens compose from
    // that inbox. If the hint doesn't take, Gmail opens the default.
    const url =
      `https://mail.google.com/mail/?view=cm&fs=1` +
      `&to=${encodeURIComponent(row.email)}` +
      `&su=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}` +
      `&authuser=${encodeURIComponent("contact@keshah.com")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <main style={{ padding: 24, color: "#fff", fontFamily: "'Poppins', -apple-system, sans-serif" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, margin: 0 }}>
          Recruit
        </h1>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, margin: "6px 0 0" }}>
          Inbound applications from the careers site.
        </p>
      </header>

      {sessionSlug ? (
        <SessionLiveView
          slug={sessionSlug}
          onBack={() => {
            router.push("/dashboard/applications");
            load();
          }}
          onStatus={async (row, status) => {
            if (status === "accepted") {
              const plan = confirmAccept(row);
              if (plan) await updateStatus(row.id, status, plan);
              return;
            }
            if (status === "denied" && !confirmDeny(row, row.has_video)) return;
            await updateStatus(row.id, status);
          }}
        />
      ) : (
      <>
      <SessionsPanel
        onOpenSession={(slug) =>
          router.push(`/dashboard/applications?session=${encodeURIComponent(slug)}`)
        }
      />

      <nav style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            setShowInbox(true);
            setExpandedId(null);
          }}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: `1px solid ${showInbox ? "#fff" : "rgba(255,255,255,0.16)"}`,
            background: showInbox ? "#fff" : "transparent",
            color: showInbox ? "#000" : "rgba(255,255,255,0.85)",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "inherit",
            fontWeight: 500,
            letterSpacing: 0.1,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Inbox
          <UnreadBadge count={inbox.unread} />
        </button>
        {(Object.keys(TAB_LABELS) as TabKey[]).map((k) => {
          const active = !showInbox && tab === k;
          const count = grouped[k].length;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setTab(k);
                setShowInbox(false);
                setExpandedId(null);
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? "#fff" : "rgba(255,255,255,0.16)"}`,
                background: active ? "#fff" : "transparent",
                color: active ? "#000" : "rgba(255,255,255,0.85)",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "inherit",
                fontWeight: 500,
                letterSpacing: 0.1,
              }}
            >
              {TAB_LABELS[k]}
              <span
                style={{
                  marginLeft: 6,
                  opacity: 0.6,
                  fontSize: 12,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            load();
            inbox.reload(true);
          }}
          style={{
            marginLeft: "auto",
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "transparent",
            color: "rgba(255,255,255,0.65)",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          Refresh
        </button>
      </nav>

      {showInbox ? (
        <InboxPanel
          conversations={inbox.conversations}
          loading={inbox.loading}
          error={inbox.error}
          onChanged={refreshInbox}
        />
      ) : (
      <>
      {loading && (
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Loading…</div>
      )}
      {error && (
        <div style={{ color: "#F26B4C", fontSize: 13 }}>Error: {error}</div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div
          style={{
            border: "1px dashed rgba(255,255,255,0.14)",
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            color: "rgba(255,255,255,0.5)",
            fontSize: 13,
          }}
        >
          No {TAB_LABELS[tab].toLowerCase()} applications.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((row) => (
          <ApplicationRow
            key={row.id}
            row={row}
            expanded={expandedId === row.id}
            onToggle={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
            onAccept={() => {
              const plan = confirmAccept(row);
              if (plan) updateStatus(row.id, "accepted", plan);
            }}
            onDeny={() => {
              if (confirmDeny(row, row.denial_email_due ?? (row.has_video || !!row.interview_video_submitted_at))) updateStatus(row.id, "denied");
            }}
            onReopen={() => updateStatus(row.id, "booked")}
            hasThread={threadIds.has(row.id)}
            onThreadRead={refreshInbox}
          />
        ))}
      </div>
      </>
      )}
      </>
      )}
    </main>
  );
}

function ApplicationRow({
  row,
  expanded,
  onToggle,
  onAccept,
  onDeny,
  onReopen,
  hasThread,
  onThreadRead,
}: {
  row: Application;
  expanded: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onDeny: () => void;
  onReopen: () => void;
  hasThread: boolean;
  onThreadRead: () => void;
}) {
  const relTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
  const bookingLabel = row.calendly_event_start_time
    ? new Date(row.calendly_event_start_time).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          background: "transparent",
          border: 0,
          color: "#fff",
          padding: "14px 16px",
          display: "grid",
          gridTemplateColumns: "1.4fr 1.4fr 1fr 1fr 100px 24px",
          gap: 12,
          alignItems: "center",
          fontFamily: "inherit",
          fontSize: 13,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>{row.full_name ?? "(no name yet)"}</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
            {row.college ?? "—"}
          </div>
          {row.outside_us_timezone && (
            <div style={{ color: "#ff6b6b", fontSize: 12, fontWeight: 600 }}>
              Outside US ({row.outside_us_timezone})
            </div>
          )}
        </div>
        <div style={{ color: "rgba(255,255,255,0.8)" }}>{row.email ?? "—"}</div>
        <div style={{ color: "rgba(255,255,255,0.65)" }}>
          {row.gender ?? "—"}
          {row.graduation_year ? ` · ${row.graduation_year === "graduated" ? "Graduated" : row.graduation_year}` : ""}
        </div>
        <div style={{ color: "rgba(255,255,255,0.65)" }}>
          {bookingLabel ?? (row.status === "pending" ? "—" : "Awaiting")}
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
          {relTime(row.last_updated_at ?? row.submitted_at ?? row.created_at)}
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.55)",
            transform: expanded ? "rotate(90deg)" : "none",
            transition: "transform 120ms ease",
          }}
        >
          ›
        </div>
      </button>

      {expanded && (
        <div
          style={{
            padding: 16,
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {row.has_video && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={async () => {
                    // Open synchronously so popup blockers allow it, then point it at the signed URL.
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
                  }}
                  style={{ background: "#fff", color: "#000", border: "none", borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Watch video
                </button>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                  {row.interview_video_submitted_at
                    ? `Interview video${row.interview_session ? ` (${row.interview_session})` : ""}, submitted ${new Date(row.interview_video_submitted_at).toLocaleString()}`
                    : "Application video"}
                </span>
              </div>
            )}
            {/* Booking panel — only visible for booked / past-booked rows. */}
            {(row.calendly_event_start_time || row.calendly_join_url) && (
              <div
                style={{
                  padding: "12px 14px",
                  background: "rgba(74,222,128,0.08)",
                  border: "1px solid rgba(74,222,128,0.25)",
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
                  Interview booked
                </div>
                <div style={{ fontSize: 14, color: "#fff" }}>
                  {row.calendly_event_start_time
                    ? new Date(row.calendly_event_start_time).toLocaleString(undefined, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZoneName: "short",
                      })
                    : "Time unknown"}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                  {row.calendly_join_url && (
                    <a
                      href={row.calendly_join_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#4ade80", fontSize: 12, textDecoration: "underline" }}
                    >
                      Join call
                    </a>
                  )}
                  {row.calendly_reschedule_url && (
                    <a
                      href={row.calendly_reschedule_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, textDecoration: "underline" }}
                    >
                      Reschedule link
                    </a>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, fontSize: 13 }}>
              <Detail label="Full name" value={row.full_name} />
              <Detail label="Email" value={row.email} />
              <Detail label="Phone" value={row.phone} />
              <Detail label="Gender" value={row.gender} />
              <Detail label="College" value={row.college} />
              <Detail label="Grad year" value={row.graduation_year === "graduated" ? "Already graduated" : row.graduation_year} />
              <Detail label="Can commit" value={row.can_commit} />
              <Detail label="On-camera" value={row.comfortable_on_camera} />
              <Detail label="iPhone" value={row.has_iphone ?? null} />
              <Detail label="US bank account" value={row.has_us_bank ?? null} />
              {row.status === "denied" && (
                <Detail label="Denied" value={row.denied_reason === "no_video" ? "Automatically, no video by the deadline" : "By you"} />
              )}
              <Detail label="Wants virality" value={row.wants_virality} />
              <Detail label="Posted before" value={row.posted_before} />
              <Detail label="Social" value={row.social_handle} />
              <Detail label="Created" value={relTime(row.created_at)} />
              <Detail label="Submitted" value={relTime(row.submitted_at)} />
              <Detail label="Booked at" value={relTime(row.booked_at)} />
            </div>

            {hasThread && (
              <div style={{ padding: "12px 14px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.55)", fontWeight: 600, marginBottom: 8 }}>
                  Messages
                </div>
                <Thread applicationId={row.id} onRead={onThreadRead} compact />
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {row.status !== "accepted" && (
                <button
                  type="button"
                  onClick={onAccept}
                  style={{
                    padding: "10px 16px",
                    background: "#4CAF50",
                    color: "#fff",
                    border: 0,
                    borderRadius: 8,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  disabled={!row.email}
                  title={!row.email ? "Applicant has no email yet" : "Accept: makes them a creator, sets up their keshah.com inbox, sends the welcome email and contract"}
                >
                  Accept
                </button>
              )}
              {row.status !== "denied" && (
                <button
                  type="button"
                  onClick={onDeny}
                  style={{
                    padding: "10px 16px",
                    background: "transparent",
                    color: "#F26B4C",
                    border: "1px solid rgba(242,107,76,0.4)",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Deny
                </button>
              )}
              {(row.status === "accepted" || row.status === "denied") && (
                <button
                  type="button"
                  onClick={onReopen}
                  style={{
                    padding: "10px 16px",
                    background: "transparent",
                    color: "rgba(255,255,255,0.6)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 13,
                  }}
                >
                  Reopen
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.4)",
          fontWeight: 600,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 13 }}>{value ?? "—"}</div>
    </div>
  );
}

type AcceptPlan = { plan: "lite" | "full" | "format"; custom_base_cents?: number };

/**
 * Accept sends emails and sets up accounts, so it always asks first, and asks
 * which plan they're on after the trial (the offer email names it).
 * Null = cancelled.
 */
function confirmAccept(row: { full_name?: string | null; email?: string | null }): AcceptPlan | null {
  const name = row.full_name || row.email || "this applicant";
  const raw = window.prompt(
    `Accept ${name}? Their plan after the trial:\n\n  5 = Full: 5 videos a day, $1,000/month\n  3 = Lite: 3 videos a day, $600/month\n  or a monthly $ amount (e.g. 1200) = Format creator\n\nThis makes them a creator, sets up their @keshah.com email, emails the offer (it names this plan) and starts their 20-day trial. Nothing is sent until you press OK.`,
    "5",
  );
  if (raw === null) return null;
  const v = raw.trim().replace(/[$,]/g, "");
  if (v === "5" || v === "") return { plan: "full" };
  if (v === "3") return { plan: "lite" };
  const n = Number(v);
  if (Number.isFinite(n) && n >= 100) return { plan: "format", custom_base_cents: Math.round(n * 100) };
  window.alert("Type 5, 3, or a monthly amount like 1200.");
  return null;
}

/** Says exactly what Deny sends: an email only to people who sent their video test. */
function confirmDeny(row: { full_name?: string | null; email?: string | null }, emailed: boolean): boolean {
  const name = row.full_name || row.email || "this applicant";
  return window.confirm(
    `Deny ${name}?\n\n${emailed ? "They'll get a short email saying we're not moving forward." : "No email, they didn't send a video."}`,
  );
}
