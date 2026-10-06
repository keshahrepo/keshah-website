"use client";

import { useCallback, useEffect, useState } from "react";
import type { Invoice } from "@/lib/creators/types";
import { fmtMonthLong, fmtUsd } from "@/lib/creators/time";
import { Button, C, Card, buttonStyle, Eyebrow, H, Msg, P, Pill, Row, api, statusColor, Skel, SkelCard } from "./ui";

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

  const load = useCallback(() => {
    api<{ last_month: string; current: Invoice | null; history: Invoice[] }>("/api/creator/invoices").then(setData, (e) =>
      setErr(e.message),
    );
  }, []);
  useEffect(load, [load]);

  async function submit(number: string) {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/creator/invoices", { action: "submit", number });
      window.location.href = `/creator/invoices/${encodeURIComponent(number)}`;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  if (!data) return err ? <Card><P style={{ marginBottom: 0 }}>{err}</P></Card> : <><SkelCard lines={3} height={260} /><SkelCard lines={2} height={180} /></>;
  const cur = data.current;

  return (
    <div>
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
            <Msg error={err} />
            {cur.status === "draft" ? (
              <>
                <P style={{ fontSize: 12, color: C.faint, marginTop: 12 }}>
                  Check the lines. If something looks wrong, message your manager on Slack before you submit.
                </P>
                <Button onClick={() => submit(cur.number)} disabled={busy} style={{ width: "100%" }}>
                  {busy ? "Submitting..." : "Confirm and submit"}
                </Button>
              </>
            ) : (
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
    </div>
  );
}
