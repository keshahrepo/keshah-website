"use client";

import { useEffect, useState } from "react";

type SenderStats = {
  sender: string;
  sent: number;
  clicked: number;
  trials: number;
  paid: number;
  cancelled: number;
  stillInTrial: number;
  trialsOutsideWindow: number;
  clickRatePct: number | null;
  trialRatePct: number | null;
  paidRatePct: number | null;
};

type Conversion = {
  userId: string;
  firstName: string;
  sender: string;
  clickedAt: string;
  trialAt: string;
  hoursToTrial: number;
  withinWindow: boolean;
  outcome: "paid" | "cancelled" | "in_trial";
};

type ApiResponse = {
  days: number;
  attribution_window_days: number;
  totals: {
    sent: number;
    clicked: number;
    trials: number;
    paid: number;
    cancelled: number;
    still_in_trial: number;
    click_rate_pct: number | null;
    trial_rate_pct: number | null;
    paid_rate_pct: number | null;
  };
  senders: SenderStats[];
  conversions: Conversion[];
  generated_at: string;
};

const RANGE_OPTIONS = [
  { key: 7, label: "Last 7d" },
  { key: 14, label: "Last 14d" },
  { key: 30, label: "Last 30d" },
  { key: 90, label: "Last 90d" },
];

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

function hoursLabel(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

const cell: React.CSSProperties = {
  padding: "10px 14px 10px 0",
  borderBottom: "1px solid rgba(255,255,255,0.07)",
  fontSize: 13,
  color: "rgba(255,255,255,0.8)",
  verticalAlign: "top",
};
const head: React.CSSProperties = {
  padding: "0 14px 8px 0",
  borderBottom: "1px solid rgba(255,255,255,0.15)",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.45)",
  textAlign: "left",
};
const num: React.CSSProperties = { ...cell, fontVariantNumeric: "tabular-nums" };

export default function ResultsClient() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/outreach/results?days=${days}&window=7`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as ApiResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [days]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {RANGE_OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => setDays(o.key)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.15)",
              background: days === o.key ? "rgba(255,255,255,0.14)" : "transparent",
              color: days === o.key ? "#fff" : "rgba(255,255,255,0.6)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        ))}
        {loading && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", alignSelf: "center" }}>
            loading…
          </span>
        )}
      </div>

      {error && (
        <p style={{ color: "#ff8a65", fontSize: 13 }}>Couldn&apos;t load results: {error}</p>
      )}

      {data && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 12,
              marginBottom: 28,
            }}
          >
            {[
              { label: "Texted", value: data.totals.sent, sub: "marked sent" },
              {
                label: "Tapped the link",
                value: data.totals.clicked,
                sub: pct(data.totals.click_rate_pct) + " of texted",
              },
              {
                label: "Started a trial",
                value: data.totals.trials,
                sub: pct(data.totals.trial_rate_pct) + " of tappers",
              },
              {
                label: "Paid",
                value: data.totals.paid,
                sub: `${pct(data.totals.paid_rate_pct)} of trials · ${data.totals.still_in_trial} still in trial`,
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "rgba(255,255,255,0.45)",
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    color: "#fff",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.2,
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{s.sub}</div>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 10px" }}>
            By sender
          </h2>
          <div style={{ overflowX: "auto", marginBottom: 32 }}>
            <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={head}>Sender</th>
                  <th style={head}>Texted</th>
                  <th style={head}>Tapped</th>
                  <th style={head}>Tap rate</th>
                  <th style={head}>Trials</th>
                  <th style={head}>Trial rate</th>
                  <th style={head}>Paid</th>
                  <th style={head}>Paid rate</th>
                  <th style={head}>In trial</th>
                  <th style={head}>Late</th>
                </tr>
              </thead>
              <tbody>
                {data.senders.length === 0 && (
                  <tr>
                    <td style={cell} colSpan={10}>
                      Nothing in this range yet.
                    </td>
                  </tr>
                )}
                {data.senders.map((s) => (
                  <tr key={s.sender}>
                    <td style={{ ...cell, color: "#fff" }}>{s.sender}</td>
                    <td style={num}>{s.sent}</td>
                    <td style={num}>{s.clicked}</td>
                    <td style={num}>{pct(s.clickRatePct)}</td>
                    <td style={num}>{s.trials}</td>
                    <td style={num}>{pct(s.trialRatePct)}</td>
                    <td style={{ ...num, color: "#8fdc9f", fontWeight: 600 }}>{s.paid}</td>
                    <td style={num}>{pct(s.paidRatePct)}</td>
                    <td style={{ ...num, color: "rgba(255,255,255,0.55)" }}>
                      {s.stillInTrial || "—"}
                    </td>
                    <td
                      style={{ ...num, color: "rgba(255,255,255,0.4)" }}
                      title={`Trials that came more than ${data.attribution_window_days} days after the tap, so they don't count`}
                    >
                      {s.trialsOutsideWindow || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 10px" }}>
            Trials after a tap
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={head}>Lead</th>
                  <th style={head}>Sender</th>
                  <th style={head}>Tapped</th>
                  <th style={head}>Trial started</th>
                  <th style={head}>Gap</th>
                  <th style={head}>Outcome</th>
                  <th style={head}>Counts</th>
                </tr>
              </thead>
              <tbody>
                {data.conversions.length === 0 && (
                  <tr>
                    <td style={cell} colSpan={7}>
                      No trials yet from a tapped link in this range.
                    </td>
                  </tr>
                )}
                {data.conversions.map((c) => (
                  <tr key={c.userId}>
                    <td style={{ ...cell, color: "#fff" }}>{c.firstName}</td>
                    <td style={cell}>{c.sender}</td>
                    <td style={cell}>{new Date(c.clickedAt).toLocaleString()}</td>
                    <td style={cell}>{new Date(c.trialAt).toLocaleString()}</td>
                    <td style={num}>{hoursLabel(c.hoursToTrial)}</td>
                    <td style={cell}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 7px",
                          borderRadius: 4,
                          background:
                            c.outcome === "paid"
                              ? "rgba(90,190,110,0.16)"
                              : c.outcome === "cancelled"
                                ? "rgba(192,62,6,0.18)"
                                : "rgba(255,255,255,0.08)",
                          color:
                            c.outcome === "paid"
                              ? "#8fdc9f"
                              : c.outcome === "cancelled"
                                ? "#e2845c"
                                : "rgba(255,255,255,0.55)",
                        }}
                      >
                        {c.outcome === "paid"
                          ? "paid"
                          : c.outcome === "cancelled"
                            ? "cancelled"
                            : "in trial"}
                      </span>
                    </td>
                    <td style={cell}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 7px",
                          borderRadius: 4,
                          background: c.withinWindow
                            ? "rgba(90,190,110,0.16)"
                            : "rgba(255,255,255,0.08)",
                          color: c.withinWindow ? "#8fdc9f" : "rgba(255,255,255,0.45)",
                        }}
                      >
                        {c.withinWindow ? "yes" : "too late"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 20 }}>
            A trial counts for a sender when the lead tapped their link and started the trial
            within {data.attribution_window_days} days of that tap. Taps are recorded on the
            lead&apos;s record, so tapping Monday and subscribing Thursday still counts.
            &ldquo;Paid&rdquo; means the trial actually billed (converted_trial from the
            RevenueCat webhook), not just that they got past the paywall. Generated{" "}
            {new Date(data.generated_at).toLocaleString()}.
          </p>
        </>
      )}
    </div>
  );
}
