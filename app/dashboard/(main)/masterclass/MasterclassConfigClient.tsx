"use client";

import { useMemo, useState } from "react";

interface Props {
  initialEnabled: boolean;
  initialCalendlyUrl: string;
  initialMeetUrl: string;
  initialAvailableUntilIso: string | null;
  bookedCount: number;
}

// Format an ISO string for a <input type="datetime-local"> field, which
// expects a local timezone value without the trailing Z or offset.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function localInputToIso(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

function formatCountdown(until: Date | null): string {
  if (!until) return "no deadline set";
  const now = new Date();
  const ms = until.getTime() - now.getTime();
  if (ms <= 0) return "expired";
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} left`;
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} left`;
  if (days < 3) return `${days} ${days === 1 ? "day" : "days"} left`;
  if (days <= 7) {
    const w = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `Available until ${w[until.getDay()]}`;
  }
  return `Available until ${until.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// Event-strip countdown — precise hours at multi-day scales so the number
// visibly drops. Mirrors formatMasterclassEventCountdown in the Flutter widget.
function formatEventCountdown(until: Date | null): string {
  if (!until) return "";
  const now = new Date();
  const ms = until.getTime() - now.getTime();
  if (ms <= 0) return "starting soon";
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 60) return `starts in ${mins} ${mins === 1 ? "minute" : "minutes"}`;
  if (hours < 24) return `starts in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  if (days < 3) {
    const rem = hours - days * 24;
    if (rem === 0) return `starts in ${days} ${days === 1 ? "day" : "days"}`;
    return `starts in ${days} ${days === 1 ? "day" : "days"} ${rem} ${rem === 1 ? "hour" : "hours"}`;
  }
  if (days <= 7) return `starts in ${days} days`;
  const w = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `starts ${w[until.getDay()]}, ${until.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export default function MasterclassConfigClient(props: Props) {
  const [enabled, setEnabled] = useState(props.initialEnabled);
  const [calendlyUrl, setCalendlyUrl] = useState(props.initialCalendlyUrl);
  const [meetUrl, setMeetUrl] = useState(props.initialMeetUrl);
  const [availableUntilLocal, setAvailableUntilLocal] = useState(
    isoToLocalInput(props.initialAvailableUntilIso)
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const untilDate = useMemo(() => {
    if (!availableUntilLocal) return null;
    const d = new Date(availableUntilLocal);
    return isNaN(d.getTime()) ? null : d;
  }, [availableUntilLocal]);

  const inputInvalid = enabled && (!calendlyUrl.startsWith("https://") || !untilDate);
  const disableSave = saving || inputInvalid;

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const res = await fetch("/api/admin/masterclass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          calendlyUrl,
          meetUrl,
          availableUntilIso: localInputToIso(availableUntilLocal),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error || "Save failed");
      } else {
        setSaveOk(true);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    marginBottom: 8,
    display: "block",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div>
      {/* Status summary */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 10px",
                background: enabled ? "rgba(53,144,51,0.15)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${enabled ? "rgba(53,144,51,0.4)" : "rgba(255,255,255,0.15)"}`,
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                color: enabled ? "#4ade80" : "rgba(255,255,255,0.5)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: enabled ? "#4ade80" : "rgba(255,255,255,0.4)",
                }}
              />
              {enabled ? "LIVE" : "OFF"}
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
              {formatCountdown(untilDate)}
              {props.bookedCount > 0 && (
                <>
                  {" · "}
                  <span style={{ color: "#fff" }}>{props.bookedCount}</span> booked
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Enabled toggle */}
      <div style={cardStyle}>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>
              Show masterclass banner in-app
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              When on, non-India non-purchaser users see the funnel on their dashboard.
              Auto-hides when deadline passes.
            </div>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: 20, height: 20, cursor: "pointer", accentColor: "#4ade80" }}
          />
        </label>
      </div>

      {/* Calendly URL */}
      <div style={cardStyle}>
        <label style={labelStyle}>Calendly URL</label>
        <input
          type="url"
          value={calendlyUrl}
          onChange={(e) => setCalendlyUrl(e.target.value)}
          placeholder="https://calendly.com/aadi-keshah/microneedling-masterclass"
          style={inputStyle}
        />
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
          The link that opens when a user taps BOOK YOUR SEAT.
        </p>
      </div>

      {/* Meet URL */}
      <div style={cardStyle}>
        <label style={labelStyle}>Meeting URL (Google Meet / Zoom)</label>
        <input
          type="url"
          value={meetUrl}
          onChange={(e) => setMeetUrl(e.target.value)}
          placeholder="https://meet.google.com/... or https://zoom.us/j/..."
          style={inputStyle}
        />
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
          Shown as "Join masterclass" button inside the confirmation banner for
          booked users. Same link for all attendees. Optional — leave blank and
          users get the link from the Calendly email instead.
        </p>
      </div>

      {/* Event start time */}
      <div style={cardStyle}>
        <label style={labelStyle}>Event starts at</label>
        <input
          type="datetime-local"
          value={availableUntilLocal}
          onChange={(e) => setAvailableUntilLocal(e.target.value)}
          style={inputStyle}
        />
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
          When the live Google Meet actually starts. Banner auto-hides after
          this time. Booked users reset once it passes, so they see the next
          cohort when you set a new date. Set Calendly's "minimum notice"
          separately if you want to close bookings early.
        </p>
      </div>

      {/* Save button */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 24 }}>
        <button
          onClick={save}
          disabled={disableSave}
          style={{
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 600,
            color: disableSave ? "rgba(0,0,0,0.5)" : "#000",
            background: disableSave ? "rgba(255,255,255,0.3)" : "#fff",
            border: "none",
            borderRadius: 40,
            cursor: disableSave ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saveOk && (
          <span style={{ fontSize: 13, color: "#4ade80" }}>✓ Saved</span>
        )}
        {saveError && (
          <span style={{ fontSize: 13, color: "#ff6b6b" }}>{saveError}</span>
        )}
        {inputInvalid && !saveError && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            {!calendlyUrl.startsWith("https://")
              ? "Calendly URL must start with https://"
              : "Deadline required"}
          </span>
        )}
      </div>

      {/* User-facing preview */}
      <details style={{ marginTop: 32 }}>
        <summary
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: 0.5,
            textTransform: "uppercase",
            cursor: "pointer",
            marginBottom: 12,
          }}
        >
          Preview — what users see
        </summary>
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            overflow: "hidden",
            maxWidth: 380,
            marginTop: 12,
          }}
        >
          {/* Event strip — full-color KESHAH green with white pulsing dot */}
          {untilDate && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                background: "#359033",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#fff",
                  animation: "keshahPulse 1.4s ease-in-out infinite",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  letterSpacing: 0.8,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                FOUNDER EVENT · {formatEventCountdown(untilDate)}
              </span>
              <style>{`@keyframes keshahPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
            </div>
          )}
          {/* Hero image with bottom-right overlay */}
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "760 / 484",
              backgroundImage: "url('/dashboard/masterclass_hero.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              padding: 20,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(135deg, transparent 30%, rgba(0,0,0,0.55) 100%)",
              }}
            />
            <div style={{ position: "relative", textAlign: "right" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.75)",
                  letterSpacing: 1.6,
                  marginBottom: 4,
                }}
              >
                MICRONEEDLING MASTERCLASS
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#fff",
                  letterSpacing: -0.4,
                  lineHeight: 1.15,
                }}
              >
                Live with Aadi
              </div>
            </div>
          </div>
          {/* Body copy + checklist + meta + CTA */}
          <div style={{ padding: "16px 16px 16px" }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.9)", lineHeight: 1.45, marginBottom: 18 }}>
              If your hair isn't growing as fast as you'd like, join Aadi for a live masterclass on microneedling.
            </div>
            <ul style={{ margin: "0 0 18px", padding: 0, listStyle: "none" }}>
              {[
                "The right depth",
                "The exact technique",
                "How many passthroughs",
                "How to avoid scarring",
                "What to apply after",
                "How to integrate with your existing routine",
                "Member results",
                "Live Q&A",
              ].map((item) => (
                <li
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1.4,
                    color: "rgba(255,255,255,0.75)",
                    marginBottom: 8,
                  }}
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={3}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.55, marginBottom: 16 }}>
              4 years of microneedling experience condensed into a 45-minute session + Q&amp;A. The only thing we recommend apart from mechanotherapy. And the absolute fastest way Aadi has found to grow hair back.
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "rgba(255,255,255,0.5)",
                marginBottom: 14,
              }}
            >
              45 min · Google Meet · Q&amp;A
            </div>
            <div
              style={{
                padding: "12px 16px",
                background: "#fff",
                color: "#000",
                borderRadius: 40,
                textAlign: "center",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Book your seat →
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center", marginTop: 10, fontWeight: 500 }}>
              Exclusively available for KESHAH members.
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
