"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Btn,
  ErrorText,
  Loading,
  MarkPaidForm,
  PageHeader,
  SubNav,
  api,
  card,
  fmtUsd,
  h3,
  muted,
  shiftMonth,
  td,
  th,
} from "../_ui";

interface Row {
  creatorId: string;
  legalName: string;
  email: string;
  invoice: { number: string; month: string; total_cents: number; status: string; submitted_at?: string; approved_at?: string };
}
interface Resp {
  month: string | null;
  approved: Row[];
  awaitingApproval: Row[];
  totalCents: number;
}

export default function PayoutsPage() {
  // Invoices are for the month just worked, so default to last month.
  const [month, setMonth] = useState(shiftMonth(new Date().toISOString().slice(0, 7), -1));
  const [all, setAll] = useState(false);
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState("");
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr("");
    api<Resp>(`/api/admin/creators/payouts${all ? "" : `?month=${month}`}`)
      .then(setData)
      .catch((e) => setErr(String(e.message ?? e)));
  }, [month, all]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  async function approve(r: Row) {
    setErr("");
    try {
      await api(`/api/admin/creators/${r.creatorId}/invoices/${encodeURIComponent(r.invoice.number)}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "approve" }),
      });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <PageHeader
        title="Payout run"
        subtitle="Approved invoices to pay by Amex ACH. Send the money yourself, then record the date, reference and proof here."
        right={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Btn onClick={() => setMonth(shiftMonth(month, -1))} disabled={all}>
              ←
            </Btn>
            <span style={{ fontSize: 13, minWidth: 70, textAlign: "center", opacity: all ? 0.4 : 1 }}>{month}</span>
            <Btn onClick={() => setMonth(shiftMonth(month, 1))} disabled={all}>
              →
            </Btn>
            <label style={{ ...muted, display: "flex", gap: 6, alignItems: "center", marginLeft: 8, whiteSpace: "nowrap", cursor: "pointer" }}>
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> all months
            </label>
          </div>
        }
      />
      <SubNav />
      <ErrorText>{err}</ErrorText>
      {!data && !err && <Loading />}
      {data && (
        <>
          <div style={card}>
            <h3 style={h3}>
              To pay · {data.approved.length} invoice{data.approved.length === 1 ? "" : "s"} · {fmtUsd(data.totalCents)}
            </h3>
            {!data.approved.length && <p style={muted}>Nothing approved and unpaid.</p>}
            {data.approved.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th style={th}>Legal name</th>
                      <th style={th}>Invoice</th>
                      <th style={th}>Period</th>
                      <th style={{ ...th, textAlign: "right" }}>Amount</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.approved.map((r) => {
                      const key = `${r.creatorId}/${r.invoice.number}`;
                      return (
                        <tr key={key}>
                          <td style={td} colSpan={paying === key ? 5 : 1}>
                            <Link href={`/dashboard/creators-pay/${r.creatorId}`} style={{ color: "#fff" }}>
                              {r.legalName}
                            </Link>
                            <div style={muted}>{r.email}</div>
                            {paying === key && (
                              <>
                                <div style={{ fontSize: 13, marginTop: 6 }}>
                                  {r.invoice.number} · {r.invoice.month} · <strong>{fmtUsd(r.invoice.total_cents)}</strong>
                                </div>
                                <MarkPaidForm
                                  creatorId={r.creatorId}
                                  invoiceNumber={r.invoice.number}
                                  amountCents={r.invoice.total_cents}
                                  onCancel={() => setPaying(null)}
                                  onDone={() => {
                                    setPaying(null);
                                    load();
                                  }}
                                />
                              </>
                            )}
                          </td>
                          {paying !== key && (
                            <>
                              <td style={td}>{r.invoice.number}</td>
                              <td style={td}>{r.invoice.month}</td>
                              <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmtUsd(r.invoice.total_cents)}</td>
                              <td style={{ ...td, textAlign: "right" }}>
                                <span style={{ display: "inline-flex", gap: 6 }}>
                                  <a
                                    href={`/api/admin/creators/${r.creatorId}/invoices/${encodeURIComponent(r.invoice.number)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: 12, color: "#60a5fa", alignSelf: "center" }}
                                  >
                                    View
                                  </a>
                                  <Btn kind="primary" onClick={() => setPaying(key)}>
                                    Mark paid
                                  </Btn>
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    <tr>
                      <td style={{ ...td, fontWeight: 600 }} colSpan={3}>
                        Total
                      </td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtUsd(data.totalCents)}</td>
                      <td style={td}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {data.awaitingApproval.length > 0 && (
            <div style={card}>
              <h3 style={h3}>Submitted, awaiting your approval</h3>
              {data.awaitingApproval.map((r) => (
                <div
                  key={`${r.creatorId}/${r.invoice.number}`}
                  style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}
                >
                  <Link href={`/dashboard/creators-pay/${r.creatorId}`} style={{ color: "#fff", fontSize: 13 }}>
                    {r.legalName}
                  </Link>
                  <span style={muted}>
                    {r.invoice.number} · {r.invoice.month}
                  </span>
                  <span style={{ fontSize: 13 }}>{fmtUsd(r.invoice.total_cents)}</span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <a
                      href={`/api/admin/creators/${r.creatorId}/invoices/${encodeURIComponent(r.invoice.number)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 12, color: "#60a5fa", alignSelf: "center" }}
                    >
                      View
                    </a>
                    <Btn onClick={() => approve(r)}>Approve</Btn>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
