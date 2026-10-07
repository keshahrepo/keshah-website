"use client";

import { useCallback, useEffect, useState } from "react";
import type { InvoiceView as Invoice } from "@/lib/creators/invoice-auto";
import { fmtDateShort, fmtMonthLong, fmtUsd } from "@/lib/creators/time";
import PaymentsSetup, { PaymentsBanner, type PaymentView } from "./PaymentsSetup";
import { Button, C, Card, buttonStyle, Eyebrow, H, Msg, P, Pill, Row, api, inputStyle, statusColor, SkelCard } from "./ui";

const statusLabel: Record<string, string> = { draft: "Draft", submitted: "Submitted", approved: "Approved", paid: "Paid" };

function Lines({ inv }: { inv: Invoice }) {
  return (
    <div>
      {inv.lines.map((l, i) => (
        <Row key={i} style={{ padding: "7px 0", borderTop: C.border, alignItems: "flex-start" }}>
          <div style={{ fontSize: 13, color: C.dim, wordBreak: "break-word" }}>{l.label}</div>
          <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtUsd(l.amount_cents)}</div>
        </Row>
      ))}
      <Row style={{ padding: "10px 0 0", borderTop: C.border }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Total</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtUsd(inv.total_cents)}</div>
      </Row>
    </div>
  );
}

export default function InvoicesTab() {
  const [data, setData] = useState<{ last_month: string; current: Invoice | null; history: Invoice[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pay, setPay] = useState<PaymentView | null>(null);

  const load = useCallback(() => {
    api<{ last_month: string; current: Invoice | null; history: Invoice[] }>("/api/creator/invoices").then(setData, (e) =>
      setErr(e.message),
    );
  }, []);
  useEffect(load, [load]);

  const [flagOpen, setFlagOpen] = useState(false);
  const [note, setNote] = useState("");

  // Invoices are self-billed (submitted for the creator by a daily job), so the
  // only creator action is flagging one during its 3-day review window.
  async function flag(number: string) {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/creator/invoices/dispute", { number, note });
      setFlagOpen(false);
      setNote("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  if (!data) return err ? <Card><P style={{ marginBottom: 0 }}>{err}</P></Card> : <><SkelCard lines={3} height={260} /><SkelCard lines={2} height={180} /></>;
  const cur = data.current;

  return (
    <div>
      {pay?.enabled && !pay.complete && <PaymentsBanner />}
      <Card>
        <Eyebrow>{fmtMonthLong(data.last_month)} invoice</Eyebrow>
        {!cur ? (
          <P style={{ marginBottom: 0 }}>Nothing to invoice for last month.</P>
        ) : (
          <>
            <Row style={{ marginBottom: 8 }}>
              <H style={{ marginBottom: 0 }}>{cur.number}</H>
              <Pill color={statusColor[cur.status]}>{statusLabel[cur.status]}</Pill>
            </Row>
            <Lines inv={cur} />
            {cur.status === "draft" ? (
              <P style={{ fontSize: 12, color: C.faint, marginTop: 12, marginBottom: 0 }}>
                We'll send this invoice in for you in the next day. You'll get an email when it's in.
              </P>
            ) : (
              <>
                {cur.status === "submitted" && cur.paid_by_date && (
                  <P style={{ fontSize: 13, color: C.dim, marginTop: 12, marginBottom: 0 }}>
                    It'll be paid by bank transfer by {fmtDateShort(cur.paid_by_date)}.
                  </P>
                )}
                {cur.disputed_at && !cur.dispute_resolved_at && (
                  <P style={{ fontSize: 13, color: C.dim, marginTop: 8, marginBottom: 0 }}>
                    You flagged this invoice. We'll look at it and get back to you.
                  </P>
                )}
                {cur.can_dispute && !flagOpen && (
                  <P style={{ fontSize: 12, color: C.faint, marginTop: 8, marginBottom: 0 }}>
                    If anything looks wrong, tap below by {cur.dispute_by_date ? fmtDateShort(cur.dispute_by_date) : "the deadline"}.
                  </P>
                )}
                {cur.can_dispute && flagOpen && (
                  <div style={{ marginTop: 12 }}>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What looks wrong?"
                      rows={3}
                      maxLength={2000}
                      style={{ ...inputStyle, height: "auto", padding: "12px 16px", resize: "vertical", fontFamily: "inherit" }}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <Button variant="ghost" onClick={() => setFlagOpen(false)} disabled={busy} style={{ flex: 1 }}>
                        Cancel
                      </Button>
                      <Button onClick={() => flag(cur.number)} disabled={busy || !note.trim()} style={{ flex: 1 }}>
                        {busy ? "Sending..." : "Send"}
                      </Button>
                    </div>
                  </div>
                )}
                <Msg error={err} />
                {cur.can_dispute && !flagOpen && (
                  <Button variant="ghost" onClick={() => setFlagOpen(true)} style={{ width: "100%", marginTop: 12 }}>
                    Something&apos;s off?
                  </Button>
                )}
              </>
            )}
            {cur.status !== "draft" && (
              <a
                href={`/creator/invoices/${encodeURIComponent(cur.number)}`}
                className="cp-btn"
                style={{ ...buttonStyle("ghost"), display: "flex", width: "100%", marginTop: 14 }}
              >
                View or print the invoice
              </a>
            )}
          </>
        )}
      </Card>

      <Card>
        <Eyebrow>History</Eyebrow>
        {data.history.length === 0 && <P style={{ marginBottom: 0 }}>No invoices yet.</P>}
        {data.history.map((inv) => (
          <a
            key={inv.number}
            href={`/creator/invoices/${encodeURIComponent(inv.number)}`}
            style={{ display: "block", padding: "12px 0", borderTop: C.border, color: "#fff", textDecoration: "none" }}
          >
            <Row>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {inv.number} · {fmtMonthLong(inv.month)}
                </div>
                <div style={{ fontSize: 12, color: C.faint }}>
                  {inv.status === "paid" && inv.paid_at ? `Paid ${new Date(inv.paid_at).toLocaleDateString()}` : fmtUsd(inv.total_cents)}
                </div>
              </div>
              <Pill color={statusColor[inv.status]}>{statusLabel[inv.status]}</Pill>
            </Row>
          </a>
        ))}
      </Card>

      <PaymentsSetup onChange={setPay} />
    </div>
  );
}
