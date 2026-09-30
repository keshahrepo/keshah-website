"use client";

import { useEffect, useState } from "react";

// Styled to match the Trial page. Tokens are copied rather than shared
// because the Trial page inlines its own: pill-row filters, cards on
// rgba(255,255,255,0.04) with a coloured square marker, tabular numerals
// wherever digits line up, and a headline bar whose colour tracks the
// number it reports.

type SenderStats = {
  sender: string;
  clicked: number;
  trials: number;
  paid: number;
  cancelled: number;
  stillInTrial: number;
  trialsOutsideWindow: number;
  revenueUsd: number;
  proceedsUsd: number;
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
    clicked: number;
    trials: number;
    paid: number;
    cancelled: number;
    still_in_trial: number;
    trial_rate_pct: number | null;
    paid_rate_pct: number | null;
    revenue_usd: number;
    proceeds_usd: number;
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

const DIM = "rgba(255,255,255,0.4)";
const DIM2 = "rgba(255,255,255,0.55)";
const PANEL = "rgba(255,255,255,0.04)";
const EDGE = "1px solid rgba(255,255,255,0.08)";
const GREEN = "#359033";
const GOLD = "#DAA520";
const BLUE = "#6AA9E0";

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const money = (v: number) =>
  v === 0 ? "—" : `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function hoursLabel(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

const th: React.CSSProperties = {
  padding: "0 14px 8px 0",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: DIM,
  textAlign: "left",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "11px 14px 11px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  fontSize: 13,
  color: "rgba(255,255,255,0.8)",
  verticalAlign: "middle",
};
const tdNum: React.CSSProperties = { ...td, fontVariantNumeric: "tabular-nums" };

function PillRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: Array<{ key: number; label: string }>;
  selected: number;
  onSelect: (k: number) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: DIM,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "inline-flex",
          gap: 2,
          background: PANEL,
          border: EDGE,
          borderRadius: 999,
          padding: 3,
        }}
      >
        {options.map((o) => {
          const active = o.key === selected;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onSelect(o.key)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                background: active ? "#fff" : "transparent",
                color: active ? "#000" : "rgba(255,255,255,0.65)",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({
  label,
  color,
  value,
  suffix,
  sub,
}: {
  label: string;
  color: string;
  value: string;
  suffix?: string;
  sub?: string;
}) {
  return (
    <div style={{ background: PANEL, border: EDGE, borderRadius: 12, padding: "14px 16px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: DIM2,
          marginBottom: 8,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: "#fff",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        {suffix && (
          <span style={{ fontSize: 13, color: DIM, fontWeight: 400, marginLeft: 8 }}>
            {suffix}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/** Headline bar — colour tracks the number, like the Trial page health bar. */
function HeadlineBar({ t }: { t: ApiResponse["totals"] }) {
  if (t.clicked === 0) {
    return (
      <div
        style={{
          marginBottom: 20,
          padding: "14px 18px",
          background: PANEL,
          border: EDGE,
          borderRadius: 10,
          fontSize: 12,
          color: "rgba(255,255,255,0.5)",
        }}
      >
        No link taps in this range yet. Taps appear here as soon as a lead opens your
        link.
      </div>
    );
  }

  const rate = t.clicked > 0 ? t.trials / t.clicked : 0;
  const color = rate >= 0.25 ? "#8affc1" : rate >= 0.1 ? "#f0c674" : "#ff8f8f";
  const light =
    rate >= 0.25
      ? "rgba(138,255,193,0.08)"
      : rate >= 0.1
        ? "rgba(240,198,116,0.08)"
        : "rgba(255,143,143,0.08)";

  return (
    <div
      style={{
        marginBottom: 20,
        padding: "12px 18px",
        background: light,
        border: `1px solid ${color}33`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 13,
        color: "rgba(255,255,255,0.8)",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}
      >
        {pct(t.trial_rate_pct)}
      </span>
      <span>
        of people who tapped a link started a trial{" "}
        <span style={{ color: DIM }}>
          ({t.trials.toLocaleString()} / {t.clicked.toLocaleString()})
        </span>
      </span>
      <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
        {rate >= 0.25 ? "strong" : rate >= 0.1 ? "mixed" : "weak"}
      </span>
    </div>
  );
}

function Badge({ kind }: { kind: Conversion["outcome"] | "counts" | "late" }) {
  const map: Record<string, { bg: string; fg: string; text: string }> = {
    paid: { bg: "rgba(53,144,51,0.18)", fg: "#8fdc9f", text: "paid" },
    cancelled: { bg: "rgba(192,62,6,0.18)", fg: "#e2845c", text: "cancelled" },
    in_trial: { bg: "rgba(255,255,255,0.08)", fg: DIM2, text: "in trial" },
    counts: { bg: "rgba(53,144,51,0.18)", fg: "#8fdc9f", text: "yes" },
    late: { bg: "rgba(255,255,255,0.08)", fg: DIM, text: "too late" },
  };
  const s = map[kind];
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 4,
        background: s.bg,
        color: s.fg,
        whiteSpace: "nowrap",
      }}
    >
      {s.text}
    </span>
  );
}

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div
      style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "0 0 10px", flexWrap: "wrap" }}
    >
      <h2 style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: 0 }}>{children}</h2>
      {note && <span style={{ fontSize: 11, color: DIM }}>{note}</span>}
    </div>
  );
}

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
      <PillRow label="Range" options={RANGE_OPTIONS} selected={days} onSelect={setDays} />

      {loading && !data && (
        <div style={{ fontSize: 12, color: DIM, padding: "8px 0" }}>loading…</div>
      )}

      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: "12px 18px",
            background: "rgba(255,143,143,0.08)",
            border: "1px solid rgba(255,143,143,0.2)",
            borderLeft: "3px solid #ff8f8f",
            borderRadius: 10,
            fontSize: 13,
            color: "rgba(255,255,255,0.8)",
          }}
        >
          Couldn&apos;t load results: {error}
        </div>
      )}

      {data && (
        <>
          <HeadlineBar t={data.totals} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <StatCard
              label="Tapped the link"
              color={GOLD}
              value={data.totals.clicked.toLocaleString()}
              sub="leads who opened it"
            />
            <StatCard
              label="Trials"
              color={BLUE}
              value={data.totals.trials.toLocaleString()}
              suffix={pct(data.totals.trial_rate_pct)}
              sub="of tapped"
            />
            <StatCard
              label="Paid"
              color={GREEN}
              value={data.totals.paid.toLocaleString()}
              suffix={pct(data.totals.paid_rate_pct)}
              sub={`${data.totals.still_in_trial} still in trial`}
            />
            <StatCard
              label="Proceeds"
              color={GREEN}
              value={money(data.totals.proceeds_usd)}
              sub={`${money(data.totals.revenue_usd)} gross`}
            />
          </div>

          <SectionTitle note="a tap is credited to the first sender only">By sender</SectionTitle>
          <div style={{ overflowX: "auto", marginBottom: 28 }}>
            <table style={{ width: "100%", minWidth: 800, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Sender</th>
                  <th style={th}>Tapped</th>
                  <th style={th}>Trials</th>
                  <th style={th}>Trial rate</th>
                  <th style={th}>Paid</th>
                  <th style={th}>Paid rate</th>
                  <th style={th}>In trial</th>
                  <th style={th}>Proceeds</th>
                  <th style={th}>Late</th>
                </tr>
              </thead>
              <tbody>
                {data.senders.length === 0 && (
                  <tr>
                    <td style={{ ...td, color: DIM }} colSpan={9}>
                      Nothing in this range yet.
                    </td>
                  </tr>
                )}
                {data.senders.map((s) => (
                  <tr key={s.sender}>
                    <td style={{ ...td, color: "#fff", fontWeight: 500 }}>{s.sender}</td>
                    <td style={tdNum}>{s.clicked}</td>
                    <td style={tdNum}>{s.trials}</td>
                    <td style={{ ...tdNum, color: DIM2 }}>{pct(s.trialRatePct)}</td>
                    <td style={{ ...tdNum, color: "#8fdc9f", fontWeight: 600 }}>{s.paid}</td>
                    <td style={{ ...tdNum, color: DIM2 }}>{pct(s.paidRatePct)}</td>
                    <td style={{ ...tdNum, color: DIM }}>{s.stillInTrial || "—"}</td>
                    <td style={{ ...tdNum, color: "#8fdc9f" }}>{money(s.proceedsUsd)}</td>
                    <td
                      style={{ ...tdNum, color: DIM }}
                      title={`Trials more than ${data.attribution_window_days} days after the tap — not credited`}
                    >
                      {s.trialsOutsideWindow || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <SectionTitle
            note={`credited when the trial starts within ${data.attribution_window_days} days of the tap`}
          >
            Trials after a tap
          </SectionTitle>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Lead</th>
                  <th style={th}>Sender</th>
                  <th style={th}>Tapped</th>
                  <th style={th}>Trial started</th>
                  <th style={th}>Gap</th>
                  <th style={th}>Outcome</th>
                  <th style={th}>Credited</th>
                </tr>
              </thead>
              <tbody>
                {data.conversions.length === 0 && (
                  <tr>
                    <td style={{ ...td, color: DIM }} colSpan={7}>
                      No trials yet from a tapped link in this range.
                    </td>
                  </tr>
                )}
                {data.conversions.map((c) => (
                  <tr key={c.userId}>
                    <td style={{ ...td, color: "#fff", fontWeight: 500 }}>{c.firstName}</td>
                    <td style={td}>{c.sender}</td>
                    <td style={{ ...td, color: DIM2 }}>{new Date(c.clickedAt).toLocaleString()}</td>
                    <td style={{ ...td, color: DIM2 }}>{new Date(c.trialAt).toLocaleString()}</td>
                    <td style={tdNum}>{hoursLabel(c.hoursToTrial)}</td>
                    <td style={td}>
                      <Badge kind={c.outcome} />
                    </td>
                    <td style={td}>
                      <Badge kind={c.withinWindow ? "counts" : "late"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.35)",
              marginTop: 20,
              maxWidth: "80ch",
              lineHeight: 1.6,
            }}
          >
            A trial is credited to a sender when the lead tapped their link and started the trial
            within {data.attribution_window_days} days. Taps are recorded on the lead&apos;s own
            record, so tapping Monday and subscribing Thursday still counts. &ldquo;Paid&rdquo;
            means the trial actually billed, not just that they got past the paywall. Proceeds are
            after store commission and tax, using the store&apos;s own figures. Generated{" "}
            {new Date(data.generated_at).toLocaleString()}.
          </p>
        </>
      )}
    </div>
  );
}
