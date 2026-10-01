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
// + contract link; Deny marks silently (no email).

import { useCallback, useEffect, useMemo, useState } from "react";

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
  graduation_year: string | null;
  can_commit: string | null;
  comfortable_on_camera: string | null;
  wants_virality: string | null;
  posted_before: string | null;
  social_handle: string | null;
  calendly_event_start_time: string | null;
  calendly_join_url: string | null;
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
  const [tab, setTab] = useState<TabKey>("booked");
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
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setRows(prev);
    }
  }

  function openGmailAccept(row: Application) {
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

      <nav style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {(Object.keys(TAB_LABELS) as TabKey[]).map((k) => {
          const active = tab === k;
          const count = grouped[k].length;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setTab(k);
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
          onClick={load}
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
              openGmailAccept(row);
              updateStatus(row.id, "accepted");
            }}
            onDeny={() => updateStatus(row.id, "denied")}
            onReopen={() => updateStatus(row.id, "booked")}
          />
        ))}
      </div>
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
}: {
  row: Application;
  expanded: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onDeny: () => void;
  onReopen: () => void;
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
        </div>
        <div style={{ color: "rgba(255,255,255,0.8)" }}>{row.email ?? "—"}</div>
        <div style={{ color: "rgba(255,255,255,0.65)" }}>
          {row.gender ?? "—"}
          {row.graduation_year ? ` · ${row.graduation_year}` : ""}
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
              <Detail label="Grad year" value={row.graduation_year} />
              <Detail label="Can commit" value={row.can_commit} />
              <Detail label="On-camera" value={row.comfortable_on_camera} />
              <Detail label="Wants virality" value={row.wants_virality} />
              <Detail label="Posted before" value={row.posted_before} />
              <Detail label="Social" value={row.social_handle} />
              <Detail label="Created" value={relTime(row.created_at)} />
              <Detail label="Submitted" value={relTime(row.submitted_at)} />
              <Detail label="Booked at" value={relTime(row.booked_at)} />
            </div>

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
                  title={!row.email ? "Applicant has no email yet" : "Accept and open Gmail compose"}
                >
                  Accept → Gmail
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
