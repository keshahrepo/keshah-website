"use client";

import { useState } from "react";

interface Props {
  initialEnabled: boolean;
  initialCalendlyUrl: string;
}

export default function OnboardingCallConfigClient(props: Props) {
  const [enabled, setEnabled] = useState(props.initialEnabled);
  const [calendlyUrl, setCalendlyUrl] = useState(props.initialCalendlyUrl);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const inputInvalid = enabled && !calendlyUrl.startsWith("https://");
  const disableSave = saving || inputInvalid;

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const res = await fetch("/api/admin/onboarding-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, calendlyUrl }),
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
      {/* Status pill */}
      <div style={cardStyle}>
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
          When on, new US paying users see a "Let's get you set up" page
          right after purchase with a "Book my call" CTA opening this
          Calendly URL. Non-US users skip the page.
        </p>
      </div>

      {/* Enabled toggle */}
      <div style={cardStyle}>
        <label
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>
              Show onboarding-call prompt post-purchase
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              Off = new paying users go straight to notifications / reminder
              setup, no artifact shown. Flip on when you're ready to take
              calls.
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
          placeholder="https://calendly.com/aadi-keshah/regrowth-consultation-clone"
          style={inputStyle}
        />
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
          The link that opens when a user taps "Book my call". Required when
          the toggle is on — save will fail otherwise so the app doesn't ship
          a broken CTA.
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
          <span style={{ fontSize: 13, color: "#4ade80" }}>Saved</span>
        )}
        {saveError && (
          <span style={{ fontSize: 13, color: "#f87171" }}>{saveError}</span>
        )}
      </div>
    </div>
  );
}
