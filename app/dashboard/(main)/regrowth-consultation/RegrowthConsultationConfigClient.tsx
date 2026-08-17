"use client";

import { useState } from "react";

interface Props {
  initialCapacityReached: boolean;
}

export default function RegrowthConsultationConfigClient(props: Props) {
  const [capacityReached, setCapacityReached] = useState(
    props.initialCapacityReached
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const res = await fetch("/api/admin/regrowth-consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacityReached }),
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
            background: capacityReached
              ? "rgba(220,140,50,0.15)"
              : "rgba(53,144,51,0.15)",
            border: `1px solid ${
              capacityReached
                ? "rgba(220,140,50,0.4)"
                : "rgba(53,144,51,0.4)"
            }`,
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            color: capacityReached ? "#fbbf24" : "#4ade80",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: capacityReached ? "#fbbf24" : "#4ade80",
            }}
          />
          {capacityReached ? "AT CAPACITY" : "OPEN FOR BOOKINGS"}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          {capacityReached
            ? "Users see \"We're currently at capacity. New slots opening soon.\" and the button is disabled."
            : "Users can tap \"See if you qualify\" and land on the Calendly booking flow."}
        </p>
      </div>

      {/* Toggle */}
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
              Mark as at capacity
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              When on, the "See if you qualify" CTA on the Regrowth tab
              becomes disabled with a capacity message. Team throttle —
              flip on when the schedule is full so Aadi isn't overbooked.
            </div>
          </div>
          <input
            type="checkbox"
            checked={capacityReached}
            onChange={(e) => setCapacityReached(e.target.checked)}
            style={{ width: 20, height: 20, cursor: "pointer", accentColor: "#fbbf24" }}
          />
        </label>
      </div>

      {/* Save button */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 24 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 600,
            color: saving ? "rgba(0,0,0,0.5)" : "#000",
            background: saving ? "rgba(255,255,255,0.3)" : "#fff",
            border: "none",
            borderRadius: 40,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saveOk && <span style={{ fontSize: 13, color: "#4ade80" }}>Saved</span>}
        {saveError && (
          <span style={{ fontSize: 13, color: "#f87171" }}>{saveError}</span>
        )}
      </div>
    </div>
  );
}
