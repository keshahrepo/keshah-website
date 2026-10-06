"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Btn,
  Dot,
  ErrorText,
  INVOICE_COLORS,
  Loading,
  PageHeader,
  Pill,
  SubNav,
  api,
  card,
  currentMonth,
  fmtMoney,
  muted,
  shiftMonth,
  td,
  th,
} from "./_ui";

interface Row {
  creator: {
    id: string;
    name: string;
    legal_name: string;
    status: string;
    status_display: string;
    campaign_tags: string[];
    contract: { status: string };
    w9_on_file: boolean;
    pay_ready: boolean;
    is_active: boolean;
    post_sync: { last_ok_at?: string; last_error?: string | null; last_error_at?: string | null; consecutive_failures: number } | null;
  };
  completedMonths: number | null;
  levelBaseCents: number | null;
  nextLevel: { nextBaseCents: number | null; earliestMonth: string | null } | null;
  postedDays: number;
  expectedDays: number;
  missedDays: number;
  missedDaysPrev: number;
  pendingDays: number;
  claims100k: number;
  claims1m: number;
  pendingClaims: number;
  pendingDaysOff: number;
  bonusCents: number;
  totalOwedCents: number;
  attribution: { trials: number; purchases: number; purchasesInWindow: number; recordedProceedsUsd: number; purchasesWithProceeds: number; proceedsInWindowUsd: number };
  estProceedsWindowUsd: number;
  payWindowCents: number;
  roiRatio: number | null;
  roiFlag: string;
  onboarding: { done: number; total: number };
  latestInvoice: { number: string; month: string; status: string; paid_at: string | null; total_cents: number } | null;
}

interface ListResponse {
  month: string;
  rows: Row[];
  legacyCount: number;
  estimate: { fallback_proceeds_per_purchase_usd: number; green_at: number; amber_at: number };
}

/** Missed-days badge: amber at 2+, red at 4+ in a month. */
function MissBadge({ n, label }: { n: number; label: string }) {
  const color = n >= 4 ? "#f87171" : n >= 2 ? "#fbbf24" : "rgba(255,255,255,0.4)";
  return (
    <span
      title={`${n} missed weekday${n === 1 ? "" : "s"} ${label}`}
      style={{
        display: "inline-block",
        fontSize: 11,
        padding: "1px 7px",
        borderRadius: 10,
        marginRight: 4,
        color,
        background: n >= 2 ? (n >= 4 ? "rgba(248,113,113,0.15)" : "rgba(251,191,36,0.15)") : "transparent",
        border: n >= 2 ? "none" : "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {label} {n}
    </span>
  );
}

/** Post sync health: green when the last run worked, red after a failure. */
function SyncTag({ s }: { s: NonNullable<Row["creator"]["post_sync"]> }) {
  const failing = (s.consecutive_failures ?? 0) > 0;
  const title = failing
    ? `${s.consecutive_failures} failed sync${s.consecutive_failures === 1 ? "" : "s"} in a row. ${s.last_error ?? ""}`
    : `Last synced ${s.last_ok_at?.replace("T", " ").slice(0, 16) ?? "?"} UTC`;
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <Pill color={failing ? "#f87171" : "#4ade80"}>{failing ? `sync failing ${s.consecutive_failures}` : "sync ok"}</Pill>
    </span>
  );
}

const check = (on: boolean) => (
  <span style={{ color: on ? "#4ade80" : "rgba(255,255,255,0.25)" }}>{on ? "☑" : "☐"}</span>
);

export default function CreatorsPayPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<ListResponse | null>(null);
  const [err, setErr] = useState("");
  const [showEnded, setShowEnded] = useState(false);

  useEffect(() => {
    setData(null);
    setErr("");
    api<ListResponse>(`/api/admin/creators?month=${month}`)
      .then(setData)
      .catch((e) => setErr(String(e.message ?? e)));
  }, [month]);

  const rows = (data?.rows ?? []).filter((r) => showEnded || (r.creator.is_active && r.creator.status_display !== "ended"));
  const totalOwed = rows.reduce((s, r) => s + r.totalOwedCents, 0);

  return (
    <div>
      <PageHeader
        title="Creator Pay"
        subtitle="Posting, bonuses, pay owed and attributed results per creator"
        right={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Btn onClick={() => setMonth(shiftMonth(month, -1))}>←</Btn>
            <span style={{ fontSize: 13, minWidth: 70, textAlign: "center" }}>{month}</span>
            <Btn onClick={() => setMonth(shiftMonth(month, 1))}>→</Btn>
          </div>
        }
      />
      <SubNav />
      <ErrorText>{err}</ErrorText>
      {!data && !err && <Loading />}
      {data && (
        <>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <span style={muted}>
              {rows.length} creators · owed this month so far <strong style={{ color: "#fff" }}>{fmtMoney(totalOwed)}</strong>
            </span>
            <label style={{ ...muted, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} /> show ended / inactive
            </label>
            {data.legacyCount > 0 && (
              <span style={muted}>{data.legacyCount} older creator logins without pay setup are hidden</span>
            )}
          </div>
          <div className="cp-scroll" style={{ ...card, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
              <thead>
                <tr>
                  <th style={th} className="cp-sticky-col">Creator</th>
                  <th style={th}>Level</th>
                  <th style={th}>Days posted</th>
                  <th style={th} title="Missed weekdays: amber at 2+, red at 4+">Missed</th>
                  <th style={th}>Owed</th>
                  <th style={th}>Onboarding</th>
                  <th style={th}>Contract / W-9</th>
                  <th style={th}>Latest invoice</th>
                  <th style={th}>100K / 1M</th>
                  <th style={th}>Bonuses</th>
                  <th style={th}>Trials / Paid</th>
                  <th style={th} title="Real store proceeds after Apple/Google's cut, from users who paid in the last 2 months">Proceeds*</th>
                  <th style={th} title="ESTIMATE: est. proceeds ÷ total pay, last 2 months">ROI*</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.creator.id}>
                    <td style={{ ...td, minWidth: 170 }} className="cp-sticky-col">
                      <Link href={`/dashboard/creators-pay/${r.creator.id}?month=${month}`} style={{ color: "#fff", fontWeight: 500 }}>
                        {r.creator.legal_name || r.creator.name || r.creator.id}
                      </Link>
                      <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <Pill>{r.creator.status_display}</Pill>
                        {r.onboarding.done < r.onboarding.total && (
                          <Pill color="#60a5fa">
                            setup {r.onboarding.done}/{r.onboarding.total}
                          </Pill>
                        )}
                        {r.pendingDaysOff > 0 && <Pill color="#fbbf24">{r.pendingDaysOff} day-off req</Pill>}
                        {r.pendingClaims > 0 && <Pill color="#fbbf24">{r.pendingClaims} claim{r.pendingClaims > 1 ? "s" : ""} to review</Pill>}
                        {r.creator.post_sync && <SyncTag s={r.creator.post_sync} />}
                      </div>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {r.levelBaseCents === null ? (
                        <span style={muted}>Not started</span>
                      ) : (
                        <>
                          <div>{fmtMoney(r.levelBaseCents)}/mo</div>
                          <div style={muted}>{r.completedMonths} completed mo</div>
                          {r.nextLevel?.nextBaseCents && (
                            <div style={muted}>
                              → {fmtMoney(r.nextLevel.nextBaseCents)} in {r.nextLevel.earliestMonth}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={td}>
                      <div>
                        {r.postedDays} / {r.expectedDays}
                      </div>
                      <div style={muted}>
                        {r.missedDays > 0 && <span style={{ color: "#f87171" }}>{r.missedDays} missed </span>}
                        {r.pendingDays > 0 && <span>{r.pendingDays} to go</span>}
                      </div>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {r.levelBaseCents === null ? (
                        <span style={muted}>–</span>
                      ) : (
                        <>
                          <MissBadge n={r.missedDays} label="this mo" />
                          <MissBadge n={r.missedDaysPrev} label="last mo" />
                        </>
                      )}
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmtMoney(r.totalOwedCents)}</td>
                    <td style={td}>
                      {r.onboarding.done}/{r.onboarding.total}
                    </td>
                    <td style={td}>
                      <div>
                        {check(r.creator.contract.status === "signed")} contract
                        {r.creator.contract.status === "sent" && <span style={muted}> (sent)</span>}
                      </div>
                      <div>{check(r.creator.w9_on_file)} W-9</div>
                    </td>
                    <td style={td}>
                      {r.latestInvoice ? (
                        <>
                          <div>
                            {r.latestInvoice.number} <span style={muted}>{r.latestInvoice.month}</span>
                          </div>
                          <span style={{ color: INVOICE_COLORS[r.latestInvoice.status] ?? "#fff", fontSize: 12 }}>
                            {r.latestInvoice.status}
                            {r.latestInvoice.paid_at ? ` ${r.latestInvoice.paid_at.slice(0, 10)}` : ""}
                          </span>
                        </>
                      ) : (
                        <span style={muted}>none</span>
                      )}
                    </td>
                    <td style={td}>
                      {r.claims100k} / {r.claims1m}
                    </td>
                    <td style={td}>{fmtMoney(r.bonusCents)}</td>
                    <td style={td}>
                      {r.creator.campaign_tags.length ? (
                        <>
                          {r.attribution.trials} / {r.attribution.purchases}
                        </>
                      ) : (
                        <span style={muted}>no tags</span>
                      )}
                    </td>
                    <td style={td}>
                      <div>${Math.round(r.estProceedsWindowUsd).toLocaleString("en-US")}</div>
                      <div style={muted}>{r.attribution.purchasesInWindow} paid, 2 mo</div>
                      <div style={muted}>${Math.round(r.attribution.recordedProceedsUsd).toLocaleString("en-US")} all time</div>
                    </td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <Dot color={r.roiFlag} />
                        {r.roiRatio === null ? "–" : `${r.roiRatio.toFixed(2)}×`}
                      </span>
                      <div style={muted}>pay {fmtMoney(r.payWindowCents)}</div>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td style={{ ...td, ...muted }} colSpan={13}>
                      No creators yet. Use “+ Add creator”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p style={{ ...muted, lineHeight: 1.6 }}>
            * Proceeds are real store revenue after Apple and Google&apos;s cut, from users who started paying last month or this
            month (plus all time below). A paid user with nothing recorded yet counts at that creator&apos;s average. ROI
            flag = proceeds ÷ total pay over last month + this month: green ≥ {data.estimate.green_at}×, amber ≥{" "}
            {data.estimate.amber_at}×, otherwise red. Trials / paid = all-time users whose attribution campaign exactly matches one of
            the creator’s campaign tags. 100K / 1M = approved claims crossing in {month}.
          </p>
        </>
      )}
    </div>
  );
}
