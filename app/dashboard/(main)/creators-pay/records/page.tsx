"use client";

import { useEffect, useState } from "react";
import { Btn, ErrorText, Field, PageHeader, SubNav, api, card, fmtUsd, h3, input, muted, td, th } from "../_ui";

interface YearRow {
  year: string;
  creatorId: string;
  creatorName: string;
  email: string;
  w9_on_file: boolean;
  invoices: number;
  totalCents: number;
}

const year = new Date().getUTCFullYear();

export default function RecordsPage() {
  const [rows, setRows] = useState<YearRow[] | null>(null);
  const [err, setErr] = useState("");
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [packBusy, setPackBusy] = useState(false);
  const [pack, setPack] = useState<{ url: string; invoices: number; files: number; missing: string[]; bytes: number } | null>(null);
  const [packErr, setPackErr] = useState("");

  useEffect(() => {
    api<{ rows: YearRow[] }>("/api/admin/creators/records/yearly")
      .then((d) => setRows(d.rows))
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  async function buildPack() {
    setPackBusy(true);
    setPackErr("");
    setPack(null);
    try {
      setPack(await api("/api/admin/creators/records/evidence-pack", { method: "POST", body: JSON.stringify({ from, to }) }));
    } catch (e) {
      setPackErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPackBusy(false);
    }
  }

  const years = [...new Set((rows ?? []).map((r) => r.year))];

  return (
    <div>
      <PageHeader title="Records" subtitle="Payment ledger, yearly totals for 1099s, and the E-2 evidence pack" />
      <SubNav />

      <div style={card}>
        <h3 style={h3}>Date range</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 220px))", gap: 12, alignItems: "end" }}>
          <Field label="Paid from">
            <input type="date" style={input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Paid to">
            <input type="date" style={input} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
          <a
            href={`/api/admin/creators/records/paid-csv?from=${from}&to=${to}`}
            style={{ padding: "7px 14px", fontSize: 12, fontWeight: 500, borderRadius: 20, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", textDecoration: "none" }}
          >
            Download paid invoices CSV
          </a>
          <a href="/api/admin/creators/records/paid-csv" style={{ ...muted, color: "#60a5fa" }}>
            (all time)
          </a>
          <Btn kind="primary" onClick={buildPack} disabled={packBusy}>
            {packBusy ? "Building ZIP..." : "Build E-2 evidence pack"}
          </Btn>
        </div>
        <p style={{ ...muted, marginTop: 10, lineHeight: 1.6 }}>
          The evidence pack holds every invoice paid in the range, in Creator / Month folders: the signed contract PDF, the invoice, the
          payment proof, plus ledger.csv at the top. Anything missing is listed in MISSING.txt.
        </p>
        <ErrorText>{packErr}</ErrorText>
        {pack && (
          <div style={{ fontSize: 13, marginTop: 8 }}>
            <a href={pack.url} style={{ color: "#4ade80" }}>
              Download ZIP
            </a>{" "}
            <span style={muted}>
              {pack.invoices} invoices · {pack.files} files · {(pack.bytes / 1024 / 1024).toFixed(1)} MB · link valid 1 hour
            </span>
            {pack.missing.length > 0 && (
              <div style={{ color: "#fbbf24", marginTop: 6 }}>
                Missing: {pack.missing.slice(0, 8).join("; ")}
                {pack.missing.length > 8 ? ` and ${pack.missing.length - 8} more` : ""}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={h3}>Tax forms</h3>
        <p style={{ ...muted, marginTop: -6, marginBottom: 10, lineHeight: 1.6 }}>
          Every W-9 and W-8BEN creators have signed in the portal, as one ZIP for the accountant. The files are decrypted for this download
          only, and each one is logged on that creator&apos;s access log. Bank details are never included here or in the evidence pack.
        </p>
        <a
          href="/api/admin/creators/records/tax-forms"
          style={{ padding: "7px 14px", fontSize: 12, fontWeight: 500, borderRadius: 20, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", textDecoration: "none" }}
        >
          Download tax forms ZIP
        </a>
      </div>

      <div style={card}>
        <h3 style={h3}>Yearly totals per creator (by payment date)</h3>
        <p style={{ ...muted, marginTop: -6, marginBottom: 10 }}>1099-NEC is generally required at $600+ paid in a calendar year.</p>
        <ErrorText>{err}</ErrorText>
        {!rows && !err && <p style={muted}>Loading...</p>}
        {rows && !rows.length && <p style={muted}>No paid invoices yet.</p>}
        {years.map((y) => {
          const yr = rows!.filter((r) => r.year === y);
          return (
            <div key={y} style={{ marginBottom: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={th}>{y}</th>
                    <th style={th}>Email</th>
                    <th style={th}>Invoices</th>
                    <th style={th}>W-9</th>
                    <th style={{ ...th, textAlign: "right" }}>Total paid</th>
                  </tr>
                </thead>
                <tbody>
                  {yr.map((r) => (
                    <tr key={r.creatorId}>
                      <td style={td}>{r.creatorName}</td>
                      <td style={{ ...td, ...muted }}>{r.email}</td>
                      <td style={td}>{r.invoices}</td>
                      <td style={{ ...td, color: r.w9_on_file ? "#4ade80" : r.totalCents >= 60000 ? "#f87171" : "rgba(255,255,255,0.4)" }}>
                        {r.w9_on_file ? "on file" : "missing"}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmtUsd(r.totalCents)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...td, fontWeight: 600 }} colSpan={4}>
                      Total {y}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtUsd(yr.reduce((s, r) => s + r.totalCents, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
