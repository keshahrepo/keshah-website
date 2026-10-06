"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, ErrorText, Pill, api, card, h3, muted } from "../_ui";

export interface PaymentSummary {
  payment_details: {
    status: "missing" | "submitted" | "payee_set_up";
    bank_name: string | null;
    last4: string | null;
    account_type: "checking" | "savings" | null;
    submitted_at: string | null;
    payee_set_up_at: string | null;
  };
  tax_form: {
    type: "w9" | "w8ben" | null;
    status: "missing" | "submitted";
    submitted_at: string | null;
    signed_name: string | null;
    tin_last4: string | null;
    document_id: string | null;
    pdf_sha256: string | null;
  };
}

interface Bank {
  account_holder: string;
  bank_name: string;
  routing_number: string;
  account_number: string;
  account_type: string;
  expires_in: number;
}

const FORM_LABEL = { w9: "W-9", w8ben: "W-8BEN" } as const;
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/**
 * Payment section on the admin creator page. Full bank details are only ever
 * fetched on "Reveal" (logged server-side) and wiped from memory after 60s.
 */
export default function PaymentPanel({ creatorId, p, reload }: { creatorId: string; p: PaymentSummary; reload: () => void }) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [log, setLog] = useState<{ id: string; action: string; at: string; who: string }[]>([]);
  const [enabled, setEnabled] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLog = useCallback(() => {
    api<{ enabled: boolean; reveal_log: typeof log }>(`/api/admin/creators/${creatorId}/payment`)
      .then((r) => {
        setLog(r.reveal_log);
        setEnabled(r.enabled);
      })
      .catch(() => {});
  }, [creatorId]);
  useEffect(loadLog, [loadLog]);

  const hide = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setBank(null);
    setLeft(0);
  }, []);
  useEffect(() => hide, [hide]);

  async function reveal() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ bank: Bank }>(`/api/admin/creators/${creatorId}/payment/reveal`, { method: "POST" });
      setBank(r.bank);
      setLeft(r.bank.expires_in);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => {
        setLeft((s) => {
          if (s <= 1) {
            hide();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
      loadLog();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function togglePayee(on: boolean) {
    setErr("");
    try {
      await api(`/api/admin/creators/${creatorId}/payment`, { method: "PATCH", body: JSON.stringify({ payee_set_up: on }) });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const pd = p.payment_details;
  const tf = p.tax_form;
  const row = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const, padding: "6px 0" };

  return (
    <div style={card}>
      <h3 style={h3}>Payment</h3>
      {!enabled && <p style={{ ...muted, color: "#fbbf24", fontSize: 13 }}>Payments setup isn&apos;t switched on yet. CREATOR_DATA_KEY isn&apos;t set on the server.</p>}

      <div style={row}>
        <span style={{ minWidth: 90, fontSize: 13 }}>Bank</span>
        {pd.status === "missing" ? (
          <Pill color="#fbbf24">missing</Pill>
        ) : (
          <>
            <span style={{ fontSize: 13 }}>
              {pd.bank_name} ···· {pd.last4} {pd.account_type ? `(${pd.account_type})` : ""}
            </span>
            <span style={muted}>added {day(pd.submitted_at)}</span>
            <Pill color={pd.status === "payee_set_up" ? "#4ade80" : "#fbbf24"}>{pd.status === "payee_set_up" ? `payee set up ${day(pd.payee_set_up_at)}` : "payee not set up"}</Pill>
            {bank ? (
              <Btn onClick={hide}>Hide ({left}s)</Btn>
            ) : (
              <Btn onClick={reveal} disabled={busy || !enabled}>
                {busy ? "Revealing..." : "Reveal bank details"}
              </Btn>
            )}
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer", marginLeft: "auto" }}>
              <input type="checkbox" checked={pd.status === "payee_set_up"} onChange={(e) => togglePayee(e.target.checked)} />
              Payee set up in Amex
            </label>
          </>
        )}
      </div>

      {bank && (
        <div style={{ margin: "6px 0 10px", padding: 12, borderRadius: 8, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)", fontSize: 13 }}>
          {(
            [
              ["Account holder", bank.account_holder],
              ["Bank", bank.bank_name],
              ["Routing number", bank.routing_number],
              ["Account number", bank.account_number],
              ["Account type", bank.account_type],
            ] as const
          ).map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 10, padding: "2px 0" }}>
              <span style={{ ...muted, minWidth: 120 }}>{k}</span>
              <span style={{ fontFamily: "monospace", userSelect: "all" }}>{v}</span>
            </div>
          ))}
          <div style={{ ...muted, marginTop: 6 }}>This reveal was logged. It hides itself in {left} seconds.</div>
        </div>
      )}

      <div style={row}>
        <span style={{ minWidth: 90, fontSize: 13 }}>Tax form</span>
        {tf.status !== "submitted" || !tf.type ? (
          <Pill color="#fbbf24">missing</Pill>
        ) : (
          <>
            <span style={{ fontSize: 13 }}>
              {FORM_LABEL[tf.type]} signed {day(tf.submitted_at)} by {tf.signed_name}
              {tf.tin_last4 ? ` · TIN ···· ${tf.tin_last4}` : ""}
            </span>
            <a href={`/api/admin/creators/${creatorId}/payment/tax-form`} style={{ fontSize: 13, color: "#60a5fa" }} onClick={() => setTimeout(loadLog, 1500)}>
              Download tax form
            </a>
          </>
        )}
      </div>

      {log.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...muted, marginBottom: 4 }}>Access log</div>
          {log.map((e) => (
            <div key={e.id} style={{ fontSize: 12, padding: "2px 0", color: "rgba(255,255,255,0.7)" }}>
              {e.at.replace("T", " ").slice(0, 19)} UTC · {e.action.replace(/_/g, " ")} · {e.who}
            </div>
          ))}
        </div>
      )}
      <ErrorText>{err}</ErrorText>
    </div>
  );
}
