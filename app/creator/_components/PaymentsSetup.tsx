"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { adoptedSignatureText } from "@/lib/creators/signature";
import {
  IRS_CONSENT_STATEMENT,
  US_STATES,
  W8BEN_CAPACITY,
  W8BEN_CERTIFICATION,
  W9_CERTIFICATION,
  W9_CERTIFICATION_INSTRUCTIONS,
  W9_CLASSIFICATIONS,
  checkSignature,
  validateBank,
  validateW8ben,
  validateW9,
} from "@/lib/creators/payment-validate";
import { Button, C, Card, CheckCircle, Eyebrow, Field, H, Msg, P, Pill, Row, SkelCard, api, inputStyle, prefersReducedMotion } from "./ui";

/** Same handwriting font the contract and the signed tax PDF use. */
const SIGNATURE_FONT = "Great Vibes";
const SIGNATURE_FONT_CSS_URL = "https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap";
/** Must match TAX_CERT_VERSION in lib/creators/payments.ts. */
const TAX_CERT_VERSION = "tax-cert-v1";

export interface PaymentView {
  enabled: boolean;
  legal_name: string;
  payment_details: {
    status: "missing" | "submitted" | "payee_set_up";
    bank_name: string | null;
    last4: string | null;
    account_type: "checking" | "savings" | null;
    submitted_at: string | null;
  };
  tax_form: { type: "w9" | "w8ben" | null; status: "missing" | "submitted"; submitted_at: string | null; tin_last4: string | null };
  complete: boolean;
}

type Fields = Record<string, string | boolean>;
const FORM_NAME = { w9: "W-9", w8ben: "W-8BEN" } as const;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

// ---------------------------------------------------------------- small pieces

function TextIn({
  label,
  value,
  onChange,
  hint,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
  inputMode?: "numeric" | "text";
  autoComplete?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <Field label={label}>
      <input style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} {...rest} />
      {hint && <span style={{ display: "block", fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.45 }}>{hint}</span>}
    </Field>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12, padding: "4px 0", cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, width: 22, height: 22, flexShrink: 0, accentColor: "#fff" }}
      />
      <span style={{ fontSize: 14, color: "#fff", lineHeight: 1.5 }}>{children}</span>
    </label>
  );
}

function Choice({ options, value, onChange }: { options: readonly (readonly [string, string])[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
      {options.map(([k, label]) => {
        const on = value === k;
        return (
          <button
            key={k}
            type="button"
            className="cp-btn"
            onClick={() => onChange(k)}
            aria-pressed={on}
            style={{
              minHeight: 44,
              padding: "10px 16px",
              borderRadius: 999,
              border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.2)",
              background: on ? "#fff" : "rgba(255,255,255,0.04)",
              color: on ? "#000" : "#fff",
              fontFamily: C.font,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const selectStyle: CSSProperties = { ...inputStyle, appearance: "none", WebkitAppearance: "none" };

function Signature({ text }: { text: string }) {
  return (
    <div style={{ background: "#fff", color: "#0d1a59", borderRadius: 10, padding: "10px 16px 6px", overflow: "hidden", marginBottom: 14 }}>
      <div
        style={{
          fontFamily: `'${SIGNATURE_FONT}', cursive`,
          fontSize: 40,
          lineHeight: 1.3,
          wordSpacing: "0.15em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          borderBottom: "1px solid #0d1a5966",
        }}
      >
        {adoptedSignatureText(text)}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Row style={{ padding: "8px 0", borderTop: C.border, alignItems: "flex-start" }}>
      <div style={{ fontSize: 13, color: C.dim, flexShrink: 0, maxWidth: "45%" }}>{label}</div>
      <div style={{ fontSize: 14, textAlign: "right", wordBreak: "break-word" }}>{value || <span style={{ color: C.faint }}>Blank</span>}</div>
    </Row>
  );
}

// ---------------------------------------------------------------- tax form wizard

function W9Fields({ f, set }: { f: Fields; set: (k: string, v: string | boolean) => void }) {
  const s = (k: string) => String(f[k] ?? "");
  const cls = s("classification");
  const flowThrough = cls === "partnership" || cls === "trust" || (cls === "llc" && s("llc_code") === "P");
  return (
    <>
      <TextIn label="1. Your name, exactly as it is on your tax return" value={s("name")} onChange={(v) => set("name", v)} autoComplete="name" />
      <TextIn
        label="2. Business name (only if you have one)"
        value={s("business_name")}
        onChange={(v) => set("business_name", v)}
        hint="Most creators leave this blank."
      />
      <Field label="3a. Federal tax classification">
        <select style={selectStyle} value={cls} onChange={(e) => set("classification", e.target.value)}>
          {W9_CLASSIFICATIONS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <span style={{ display: "block", fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.45 }}>
          If you&apos;re paid as yourself, pick Individual or sole proprietor. That&apos;s right for almost everyone.
        </span>
      </Field>
      {cls === "llc" && (
        <Field label="How your LLC is taxed">
          <select style={selectStyle} value={s("llc_code")} onChange={(e) => set("llc_code", e.target.value)}>
            <option value="">Pick one</option>
            <option value="C">C corporation</option>
            <option value="S">S corporation</option>
            <option value="P">Partnership</option>
          </select>
        </Field>
      )}
      {cls === "other" && <TextIn label="Your tax classification" value={s("other_text")} onChange={(v) => set("other_text", v)} />}
      {flowThrough && (
        <Check checked={f.foreign_partners === true} onChange={(v) => set("foreign_partners", v)}>
          3b. My business has foreign partners, owners or beneficiaries.
        </Check>
      )}
      <details style={{ marginBottom: 14 }}>
        <summary style={{ fontSize: 13, color: C.dim, cursor: "pointer", padding: "6px 0" }}>4. Exemptions (leave these blank unless your accountant told you otherwise)</summary>
        <div style={{ paddingTop: 10 }}>
          <TextIn label="Exempt payee code (if any)" value={s("exempt_payee_code")} onChange={(v) => set("exempt_payee_code", v)} maxLength={2} />
          <TextIn label="FATCA exemption code (if any)" value={s("fatca_code")} onChange={(v) => set("fatca_code", v)} maxLength={1} />
        </div>
      </details>
      <TextIn label="5. Street address (with apartment or suite number)" value={s("address")} onChange={(v) => set("address", v)} autoComplete="street-address" />
      <TextIn label="6. City" value={s("city")} onChange={(v) => set("city", v)} autoComplete="address-level2" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="State">
          <select style={selectStyle} value={s("state")} onChange={(e) => set("state", e.target.value)} autoComplete="address-level1">
            <option value="">Pick</option>
            {US_STATES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </Field>
        <TextIn label="ZIP code" value={s("zip")} onChange={(v) => set("zip", v)} inputMode="numeric" autoComplete="postal-code" maxLength={10} />
      </div>
      <Field label="Your taxpayer ID number">
        <Choice
          options={[
            ["ssn", "Social Security number"],
            ["ein", "EIN"],
          ]}
          value={s("tin_type") || "ssn"}
          onChange={(v) => set("tin_type", v)}
        />
      </Field>
      <TextIn
        label={s("tin_type") === "ein" ? "EIN (9 digits)" : "Social Security number (9 digits)"}
        value={s("tin")}
        onChange={(v) => set("tin", v)}
        inputMode="numeric"
        autoComplete="off"
        maxLength={11}
        hint={
          s("tin_type") === "ein"
            ? "Use the EIN that matches the name on line 1."
            : "If you don't have a Social Security number but have an ITIN, put your ITIN here. It's encrypted as soon as you sign, and only the last 4 digits are ever shown."
        }
      />
      <Check checked={f.backup_withholding === true} onChange={(v) => set("backup_withholding", v)}>
        The IRS has told me I&apos;m currently subject to backup withholding. (Almost nobody ticks this. Leave it unticked unless you got that letter.)
      </Check>
    </>
  );
}

function W8benFields({ f, set }: { f: Fields; set: (k: string, v: string | boolean) => void }) {
  const s = (k: string) => String(f[k] ?? "");
  const [mailing, setMailing] = useState(!!s("mailing_address"));
  return (
    <>
      <TextIn label="1. Your full name" value={s("name")} onChange={(v) => set("name", v)} autoComplete="name" />
      <TextIn label="2. Country of citizenship" value={s("citizenship")} onChange={(v) => set("citizenship", v)} autoComplete="country-name" />
      <TextIn
        label="3. Home street address"
        value={s("address")}
        onChange={(v) => set("address", v)}
        autoComplete="street-address"
        hint="This has to be where you actually live. A P.O. box won't work."
      />
      <TextIn label="City or town, region, and postal code" value={s("city")} onChange={(v) => set("city", v)} placeholder="Madrid 28013" />
      <TextIn label="Country" value={s("country")} onChange={(v) => set("country", v)} autoComplete="country-name" />
      <Check
        checked={mailing}
        onChange={(v) => {
          setMailing(v);
          if (!v) {
            set("mailing_address", "");
            set("mailing_city", "");
            set("mailing_country", "");
          }
        }}
      >
        4. My mailing address is different from my home address.
      </Check>
      {mailing && (
        <>
          <TextIn label="Mailing street address" value={s("mailing_address")} onChange={(v) => set("mailing_address", v)} />
          <TextIn label="City or town, region, and postal code" value={s("mailing_city")} onChange={(v) => set("mailing_city", v)} />
          <TextIn label="Country" value={s("mailing_country")} onChange={(v) => set("mailing_country", v)} />
        </>
      )}
      <TextIn
        label="5. US tax number, SSN or ITIN (only if you have one)"
        value={s("us_tin")}
        onChange={(v) => set("us_tin", v)}
        inputMode="numeric"
        autoComplete="off"
        maxLength={11}
        hint="Most people outside the US leave this blank."
      />
      <Field label="6. Your tax number from your country">
        <Choice
          options={[
            ["have", "I have one"],
            ["not_required", "My country doesn't require one"],
            ["none", "I don't have one"],
          ]}
          value={s("ftin_status") || "have"}
          onChange={(v) => set("ftin_status", v)}
        />
      </Field>
      {(s("ftin_status") || "have") === "have" && (
        <TextIn
          label="Foreign tax number"
          value={s("ftin")}
          onChange={(v) => set("ftin", v)}
          autoComplete="off"
          hint="For example your NIF or DNI in Spain. It's encrypted as soon as you sign."
        />
      )}
      {s("ftin_status") === "none" && (
        <TextIn label="Why don't you have one?" value={s("ftin_reason")} onChange={(v) => set("ftin_reason", v)} placeholder="For example: I haven't been issued one yet" />
      )}
      <Field label="8. Date of birth">
        <input type="date" style={inputStyle} value={s("dob")} onChange={(e) => set("dob", e.target.value)} autoComplete="bday" />
      </Field>
      <Check checked={f.claim_treaty === true} onChange={(v) => set("claim_treaty", v)}>
        I want to claim tax treaty benefits (Part II). Leave this unticked if you&apos;re not sure. Most creators skip it.
      </Check>
      {f.claim_treaty === true && (
        <>
          <TextIn label="9. Treaty country (where you're a tax resident)" value={s("treaty_country")} onChange={(v) => set("treaty_country", v)} />
          <TextIn label="10. Article and paragraph (optional)" value={s("treaty_article")} onChange={(v) => set("treaty_article", v)} />
          <TextIn label="Withholding rate in % (optional)" value={s("treaty_rate")} onChange={(v) => set("treaty_rate", v)} inputMode="numeric" />
          <TextIn label="Type of income (optional)" value={s("treaty_income_type")} onChange={(v) => set("treaty_income_type", v)} />
          <TextIn label="Extra conditions you meet (optional)" value={s("treaty_conditions")} onChange={(v) => set("treaty_conditions", v)} />
        </>
      )}
    </>
  );
}

/** Shows only the last 4 characters. */
const maskTin = (t: string) => {
  const c = t.replace(/[\s-]/g, "");
  return c ? `${"•".repeat(Math.max(0, c.length - 4))}${c.slice(-4)}` : "";
};

function W9Review({ f, showTin }: { f: Fields; showTin: boolean }) {
  const s = (k: string) => String(f[k] ?? "");
  const cls = W9_CLASSIFICATIONS.find(([k]) => k === s("classification"))?.[1] ?? "";
  const tin = s("tin").replace(/\D/g, "");
  return (
    <>
      <ReviewRow label="1. Name" value={s("name")} />
      <ReviewRow label="2. Business name" value={s("business_name")} />
      <ReviewRow
        label="3a. Tax classification"
        value={`${cls}${s("classification") === "llc" ? ` (${s("llc_code")})` : ""}${s("classification") === "other" ? `: ${s("other_text")}` : ""}`}
      />
      {f.foreign_partners === true && <ReviewRow label="3b. Foreign partners" value="Yes" />}
      <ReviewRow label="4. Exempt payee code" value={s("exempt_payee_code")} />
      <ReviewRow label="4. FATCA exemption code" value={s("fatca_code")} />
      <ReviewRow label="5. Address" value={s("address")} />
      <ReviewRow label="6. City, state, ZIP" value={`${s("city")}, ${s("state").toUpperCase()} ${s("zip")}`} />
      <ReviewRow
        label={s("tin_type") === "ein" ? "Part I. EIN" : "Part I. Social Security number"}
        value={showTin ? (s("tin_type") === "ein" ? `${tin.slice(0, 2)}-${tin.slice(2)}` : `${tin.slice(0, 3)}-${tin.slice(3, 5)}-${tin.slice(5)}`) : maskTin(tin)}
      />
      {f.backup_withholding === true && <ReviewRow label="Part II" value="Item 2 crossed out (subject to backup withholding)" />}
    </>
  );
}

function W8benReview({ f, showTin }: { f: Fields; showTin: boolean }) {
  const s = (k: string) => String(f[k] ?? "");
  const st = s("ftin_status") || "have";
  return (
    <>
      <ReviewRow label="1. Name" value={s("name")} />
      <ReviewRow label="2. Citizenship" value={s("citizenship")} />
      <ReviewRow label="3. Home address" value={`${s("address")}, ${s("city")}, ${s("country")}`} />
      <ReviewRow label="4. Mailing address" value={s("mailing_address") ? `${s("mailing_address")}, ${s("mailing_city")}, ${s("mailing_country")}` : ""} />
      <ReviewRow label="5. US tax number" value={showTin ? s("us_tin") : maskTin(s("us_tin"))} />
      <ReviewRow
        label="6. Foreign tax number"
        value={st === "have" ? (showTin ? s("ftin") : maskTin(s("ftin"))) : st === "not_required" ? "Not legally required (6b ticked)" : `None: ${s("ftin_reason")}`}
      />
      <ReviewRow label="8. Date of birth" value={s("dob") ? `${s("dob").slice(5, 7)}-${s("dob").slice(8, 10)}-${s("dob").slice(0, 4)}` : ""} />
      <ReviewRow
        label="Part II. Treaty claim"
        value={f.claim_treaty === true ? [s("treaty_country"), s("treaty_article"), s("treaty_rate") && `${s("treaty_rate")}%`, s("treaty_income_type")].filter(Boolean).join(", ") : "Not claimed"}
      />
    </>
  );
}

function TaxWizard({ legalName, onDone, onCancel }: { legalName: string; onDone: (v: PaymentView) => void; onCancel: () => void }) {
  const [form, setForm] = useState<"w9" | "w8ben" | null>(null);
  const [step, setStep] = useState<"ask" | "fill" | "review">("ask");
  const [f, setF] = useState<Fields>({});
  const [err, setErr] = useState<string | null>(null);
  const [showTin, setShowTin] = useState(false);
  const [certify, setCertify] = useState(false);
  const [capacity, setCapacity] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"preview" | "sign" | null>(null);
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  function pick(us: boolean) {
    const next = us ? "w9" : "w8ben";
    setForm(next);
    setF(us ? { name: legalName, classification: "individual", tin_type: "ssn" } : { name: legalName, ftin_status: "have" });
    setStep("fill");
    setErr(null);
  }

  function toReview() {
    const r = form === "w9" ? validateW9(f) : validateW8ben(f);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setErr(null);
    setStep("review");
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  async function preview() {
    // Open the tab first (in the click) so phone browsers don't block it.
    const win = window.open("", "_blank");
    setBusy("preview");
    setErr(null);
    try {
      const res = await fetch("/api/creator/payment/tax/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, fields: f }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Couldn't build the preview.");
      const url = URL.createObjectURL(await res.blob());
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      win?.close();
      setErr((e as Error).message);
    }
    setBusy(null);
  }

  const nameOnForm = String(f.name ?? "").trim();
  const mustMatch = form === "w8ben" || f.classification === "individual";
  const sigErr = typed.trim() ? checkSignature(typed, nameOnForm, mustMatch) : null;
  const ready = certify && (form !== "w8ben" || capacity) && typed.trim() && !sigErr;

  async function sign() {
    setBusy("sign");
    setErr(null);
    try {
      const v = await api<PaymentView>("/api/creator/payment/tax/sign", {
        form,
        fields: f,
        typed_name: typed,
        certify: certify && (form !== "w8ben" || capacity),
        cert_version: TAX_CERT_VERSION,
      });
      onDone(v);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(null);
  }

  if (step === "ask" || !form) {
    return (
      <>
        <H style={{ fontSize: 16 }}>Are you a US citizen or US resident for tax purposes?</H>
        <P>
          If you&apos;re a US citizen, have a green card, or have lived in the US for most of this year and last year, the answer is
          probably yes. If you&apos;re not sure, ask your manager on Slack before you go on.
        </P>
        <div style={{ display: "grid", gap: 10 }}>
          <Button onClick={() => pick(true)}>Yes, I&apos;ll fill in a W-9</Button>
          <Button variant="ghost" onClick={() => pick(false)}>
            No, I&apos;ll fill in a W-8BEN
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Not now
          </Button>
        </div>
      </>
    );
  }

  if (step === "fill") {
    return (
      <>
        <Eyebrow>{form === "w9" ? "Form W-9" : "Form W-8BEN"}</Eyebrow>
        <P>
          {form === "w9"
            ? "This is the official IRS Form W-9. We fill it in for you from your answers, and you'll see everything before you sign."
            : "This is the official IRS Form W-8BEN for people who aren't US taxpayers. We fill it in for you from your answers, and you'll see everything before you sign."}
        </P>
        {form === "w9" ? <W9Fields f={f} set={set} /> : <W8benFields f={f} set={set} />}
        <Msg error={err} />
        <div style={{ display: "grid", gap: 10 }}>
          <Button onClick={toReview}>Review the form</Button>
          <Button variant="ghost" onClick={() => setStep("ask")}>
            Back
          </Button>
        </div>
      </>
    );
  }

  const cert = form === "w9" ? W9_CERTIFICATION : W8BEN_CERTIFICATION;
  return (
    <>
      <link rel="stylesheet" href={SIGNATURE_FONT_CSS_URL} />
      <Eyebrow>Check and sign your {FORM_NAME[form]}</Eyebrow>
      <P>Here&apos;s everything that goes on the form. Read it through, then sign at the bottom.</P>
      <div style={{ marginBottom: 10 }}>{form === "w9" ? <W9Review f={f} showTin={showTin} /> : <W8benReview f={f} showTin={showTin} />}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <Button variant="ghost" onClick={() => setShowTin(!showTin)} style={{ minHeight: 40, padding: "8px 16px", fontSize: 13 }}>
          {showTin ? "Hide tax number" : "Show tax number"}
        </Button>
        <Button variant="ghost" onClick={preview} disabled={busy !== null} style={{ minHeight: 40, padding: "8px 16px", fontSize: 13 }}>
          {busy === "preview" ? "Opening..." : "See the filled form (PDF)"}
        </Button>
        <Button variant="ghost" onClick={() => setStep("fill")} style={{ minHeight: 40, padding: "8px 16px", fontSize: 13 }}>
          Change something
        </Button>
      </div>

      <div style={{ background: "rgba(255,255,255,0.04)", border: C.border, borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{form === "w9" ? "Part II. Certification" : "Part III. Certification"}</div>
        {cert.map((line, i) => (
          <p
            key={i}
            style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.8)",
              margin: "0 0 6px",
              textDecoration: form === "w9" && i === 2 && f.backup_withholding === true ? "line-through" : undefined,
            }}
          >
            {line}
          </p>
        ))}
        {form === "w9" && <p style={{ fontSize: 12, lineHeight: 1.5, color: C.faint, margin: "8px 0 0" }}>{W9_CERTIFICATION_INSTRUCTIONS}</p>}
      </div>
      {form === "w9" && <P style={{ fontSize: 12, color: C.faint }}>{IRS_CONSENT_STATEMENT}</P>}

      <Check checked={certify} onChange={setCertify}>
        I&apos;ve read the certification above, and under penalties of perjury I certify that it&apos;s true.
      </Check>
      {form === "w8ben" && (
        <Check checked={capacity} onChange={setCapacity}>
          {W8BEN_CAPACITY}
        </Check>
      )}

      <Field label={mustMatch ? `Type your full name to sign (${nameOnForm})` : "Type your full name to sign"}>
        <input style={inputStyle} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="name" placeholder="Full name" />
      </Field>
      {typed.trim() && !sigErr && (
        <>
          <div style={{ fontSize: 12, color: C.faint, marginBottom: 4 }}>This is your signature</div>
          <Signature text={typed} />
        </>
      )}
      <P style={{ fontSize: 13 }}>
        Date: <span style={{ color: "#fff" }}>{fmtDate(new Date().toISOString())}</span>
      </P>
      <Msg error={err ?? sigErr} />
      <Button disabled={!ready || busy !== null} onClick={sign} style={{ width: "100%" }}>
        {busy === "sign" ? "Signing..." : "Adopt and sign"}
      </Button>
      <P style={{ fontSize: 12, color: C.faint, marginTop: 10, marginBottom: 0 }}>
        By pressing Adopt and sign you agree that the signature above is your electronic signature on this form, just like signing on paper.
        We record your account, the time, and the device you signed from, and keep the signed form encrypted.
      </P>
    </>
  );
}

// ---------------------------------------------------------------- bank form

function BankForm({ legalName, replacing, onDone, onCancel }: { legalName: string; replacing: boolean; onDone: (v: PaymentView) => void; onCancel?: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ account_holder: legalName, account_type: "checking" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    const r = validateBank(f);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      onDone(await api<PaymentView>("/api/creator/payment", { action: "bank", ...f }));
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <P>We pay you by bank transfer (ACH) to a US bank account. Your numbers are encrypted when you save them, and nobody can see them in the portal afterwards.</P>
      {replacing && (
        <P style={{ color: C.amber }}>If you change your bank details, we have to set you up again before we can pay you, so your next payment might take a little longer.</P>
      )}
      <TextIn label="Name on the account" value={f.account_holder ?? ""} onChange={(v) => set("account_holder", v)} autoComplete="name" />
      <TextIn label="Bank name" value={f.bank_name ?? ""} onChange={(v) => set("bank_name", v)} placeholder="For example Chase" />
      <TextIn
        label="Routing number"
        value={f.routing_number ?? ""}
        onChange={(v) => set("routing_number", v)}
        inputMode="numeric"
        autoComplete="off"
        maxLength={9}
        hint="The 9 digits at the bottom left of a check. You can also find it in your banking app."
      />
      <TextIn label="Account number" value={f.account_number ?? ""} onChange={(v) => set("account_number", v)} inputMode="numeric" autoComplete="off" maxLength={17} />
      <TextIn
        label="Type your account number again"
        value={f.account_number_confirm ?? ""}
        onChange={(v) => set("account_number_confirm", v)}
        inputMode="numeric"
        autoComplete="off"
        maxLength={17}
      />
      <Field label="Account type">
        <Choice
          options={[
            ["checking", "Checking"],
            ["savings", "Savings"],
          ]}
          value={f.account_type ?? "checking"}
          onChange={(v) => set("account_type", v)}
        />
      </Field>
      <Msg error={err} />
      <div style={{ display: "grid", gap: 10 }}>
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving..." : "Save bank details"}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- the card

function StatusRow({ done, title, sub, action }: { done: boolean; title: string; sub: string; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0", borderTop: C.border }}>
      {done ? (
        <CheckCircle size={22} />
      ) : (
        <span aria-hidden style={{ width: 22, height: 22, borderRadius: 11, border: "1.5px solid rgba(255,255,255,0.3)", flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{sub}</div>
      </div>
      {action}
    </div>
  );
}

const smallBtn: CSSProperties = { minHeight: 38, padding: "8px 14px", fontSize: 13 };

/** Reminder line for the top of a tab until both parts are done. Tapping it jumps to the payments card. */
export function PaymentsBanner() {
  return (
    <button
      type="button"
      className="cp-btn"
      onClick={() => document.getElementById("payments")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" })}
      style={{
        display: "flex",
        width: "100%",
        boxSizing: "border-box",
        gap: 10,
        alignItems: "center",
        padding: "12px 16px",
        marginBottom: 14,
        borderRadius: 14,
        background: "rgba(251,191,36,0.1)",
        border: "1px solid rgba(251,191,36,0.35)",
        color: "#fff",
        fontFamily: C.font,
        fontSize: 14,
        lineHeight: 1.45,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: C.amber, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>Add your payment details so we can pay you.</span>
      <span aria-hidden style={{ color: C.dim }}>↓</span>
    </button>
  );
}

/**
 * "Set up your payments": tax form (W-9 or W-8BEN) + bank details. Loads its
 * own data and reports it through onChange (on load and after every save).
 * Never blocks posting.
 */
export default function PaymentsSetup({ onChange }: { onChange?: (v: PaymentView) => void }) {
  const [v, setV] = useState<PaymentView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<"tax" | "bank" | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(() => {
    api<PaymentView>("/api/creator/payment").then(
      (r) => {
        setV(r);
        onChange?.(r);
      },
      (e) => setErr(e.message),
    );
  }, []);
  useEffect(load, [load]);

  function done(next: PaymentView, msg: string) {
    setV(next);
    setOpen(null);
    setOk(msg);
    onChange?.(next);
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  if (!v) return err ? <Card><P style={{ marginBottom: 0 }}>{err}</P></Card> : <SkelCard lines={3} height={220} />;

  const pd = v.payment_details;
  const tf = v.tax_form;
  const bankDone = pd.status !== "missing";
  const taxDone = tf.status === "submitted";

  return (
    <div id="payments" style={{ scrollMarginTop: 16 }}>
      <Card>
        <Row style={{ marginBottom: 6 }}>
          <Eyebrow style={{ marginBottom: 0 }}>Payments</Eyebrow>
          {v.enabled && <Pill color={v.complete ? C.green : C.amber}>{v.complete ? "All set" : `${Number(bankDone) + Number(taxDone)} of 2 done`}</Pill>}
        </Row>
        <H>Set up your payments</H>
        {!v.enabled ? (
          <P style={{ marginBottom: 0 }}>Payments setup isn&apos;t switched on yet. We&apos;ll let you know when it&apos;s ready.</P>
        ) : open === "tax" ? (
          <div style={{ paddingTop: 8 }}>
            <TaxWizard legalName={v.legal_name} onDone={(n) => done(n, "Thanks. Your tax form is signed and saved.")} onCancel={() => setOpen(null)} />
          </div>
        ) : open === "bank" ? (
          <div style={{ paddingTop: 8 }}>
            <BankForm
              legalName={v.legal_name}
              replacing={bankDone}
              onDone={(n) => done(n, `Saved. We'll pay into your account ending in ${n.payment_details.last4}.`)}
              onCancel={() => setOpen(null)}
            />
          </div>
        ) : (
          <>
            <P>You only do this once. It doesn&apos;t stop you posting, but we can&apos;t pay you until both parts are done.</P>
            <Msg ok={ok} />
            <StatusRow
              done={taxDone}
              title="Tax form"
              sub={taxDone && tf.type ? `${FORM_NAME[tf.type]} signed ${fmtDate(tf.submitted_at)}${tf.tin_last4 ? `, tax number ending in ${tf.tin_last4}` : ""}` : "A W-9, or a W-8BEN if you're not a US taxpayer"}
              action={
                <Button variant={taxDone ? "ghost" : "primary"} onClick={() => setOpen("tax")} style={smallBtn}>
                  {taxDone ? "Redo" : "Start"}
                </Button>
              }
            />
            {taxDone && (
              <a href="/api/creator/payment/tax/document" target="_blank" rel="noreferrer" style={{ display: "inline-block", fontSize: 13, color: C.dim, margin: "0 0 6px 34px" }}>
                Download my signed copy
              </a>
            )}
            <StatusRow
              done={bankDone}
              title="Bank details"
              sub={bankDone ? `${pd.bank_name} account ending in ${pd.last4}` : "Where we send your pay"}
              action={
                <Button variant={bankDone ? "ghost" : "primary"} onClick={() => setOpen("bank")} style={smallBtn}>
                  {bankDone ? "Change" : "Add"}
                </Button>
              }
            />
          </>
        )}
      </Card>
    </div>
  );
}
