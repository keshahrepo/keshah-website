"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Invoice } from "@/lib/creators/types";
import { fmtMonthLong, fmtUsd } from "@/lib/creators/time";

interface Data {
  invoice: Invoice;
  from: { legal_name: string; email: string };
  bill_to: { legal_name: string; address: string | null };
}

const statusLabel: Record<string, string> = { draft: "Draft", submitted: "Submitted", approved: "Approved", paid: "Paid" };

function fmtDay(d?: string) {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default function InvoicePrintPage() {
  const { number } = useParams<{ number: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/creator/invoices/${encodeURIComponent(decodeURIComponent(number))}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          window.location.href = "/creator/login";
          return;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Couldn't load this invoice.");
        setData(j);
      })
      .catch((e) => setErr(e.message));
  }, [number]);

  const font = "'Poppins', -apple-system, sans-serif";
  if (!data) {
    return <div style={{ padding: 24, fontFamily: font, color: "#111", background: "#fff", minHeight: "100vh" }}>{err ?? "Loading..."}</div>;
  }
  const { invoice: inv, from, bill_to } = data;
  const issued = inv.submitted_at || inv.created_at;
  const cell = { padding: "10px 0", borderBottom: "1px solid #e5e5e5", fontSize: 13, verticalAlign: "top" as const };

  return (
    <div style={{ background: "#fff", minHeight: "100vh", color: "#111", fontFamily: font }}>
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 18mm; } body { background: #fff; } }`}</style>
      <div className="no-print" style={{ background: "#000", padding: "12px 16px", display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
        <a href="/creator" style={{ color: "#fff", fontSize: 14, textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 44 }}>
          ← Back to portal
        </a>
        <button
          onClick={() => window.print()}
          style={{ background: "#fff", color: "#000", border: "none", borderRadius: 12, padding: "0 16px", minHeight: 44, fontFamily: font, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
        >
          Print or save as PDF
        </button>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px" }}>Invoice</div>
            <div style={{ fontSize: 14, color: "#555" }}>{inv.number}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13, color: "#333", lineHeight: 1.7 }}>
            <div>
              <b>Status:</b> {statusLabel[inv.status] ?? inv.status}
            </div>
            {issued && (
              <div>
                <b>Date:</b> {fmtDay(issued)}
              </div>
            )}
            {inv.paid_at && (
              <div>
                <b>Paid:</b> {fmtDay(inv.paid_at)}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 28 }}>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 6 }}>From</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{from.legal_name}</div>
            <div style={{ fontSize: 13, color: "#555" }}>{from.email}</div>
          </div>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 6 }}>Bill to</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{bill_to.legal_name}</div>
            {bill_to.address && <div style={{ fontSize: 13, color: "#555", whiteSpace: "pre-line" }}>{bill_to.address}</div>}
          </div>
        </div>

        <div style={{ fontSize: 13, color: "#333", marginBottom: 16 }}>
          <b>Service:</b> Content creation services, {fmtMonthLong(inv.month)}
          {inv.period_start && inv.period_end && (
            <>
              {" "}
              ({fmtDay(inv.period_start)} to {fmtDay(inv.period_end)})
            </>
          )}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...cell, textAlign: "left", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>Description</th>
              <th style={{ ...cell, textAlign: "right", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i}>
                <td style={{ ...cell, paddingRight: 16, wordBreak: "break-word" }}>{l.label}</td>
                <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{fmtUsd(l.amount_cents)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...cell, fontWeight: 700, fontSize: 15, borderBottom: "none" }}>Total (USD)</td>
              <td style={{ ...cell, fontWeight: 700, fontSize: 15, textAlign: "right", borderBottom: "none" }}>{fmtUsd(inv.total_cents)}</td>
            </tr>
          </tbody>
        </table>

        {inv.status === "draft" && (
          <p className="no-print" style={{ marginTop: 24, fontSize: 13, color: "#a16207" }}>
            This is a draft. Submit it from the Invoices tab in your portal.
          </p>
        )}
      </div>
    </div>
  );
}
