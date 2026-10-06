"use client";

import { useCallback, useEffect, useState } from "react";
import { adoptedSignatureText } from "@/lib/creators/signature";
import { Button, C, Card, buttonStyle, Eyebrow, Field, H, Msg, P, api, inputStyle } from "./ui";

interface ContractInfo {
  status: "none" | "sent" | "signed";
  signed_at: string | null;
  signed_sha256: string | null;
  document_id: string | null;
  /** The signed copy really was emailed (not just attempted). */
  emailed_copy: boolean;
  template: { version: string; title: string; pages: number } | null;
  download_url: string | null;
  document_url: string | null;
  legal_name_on_file: string;
  email: string;
  timezone: string;
  consent: { version: string; label: string; disclosure: string };
  signature_font: { family: string; css_url: string };
}

const linkStyle = buttonStyle("ghost");

/** Read + sign. Used as the first Getting started step and in the Contract tab. */
export function ContractSigner({ onSigned, compact }: { onSigned?: () => void; compact?: boolean }) {
  const [c, setC] = useState<ContractInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [signErr, setSignErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<ContractInfo>("/api/creator/contract").then(setC, (e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  if (!c) return <P style={{ marginBottom: 0 }}>{err ?? "Loading..."}</P>;

  if (c.status === "none" || (c.status === "sent" && !c.document_url)) {
    return <P style={{ marginBottom: 0 }}>Your contract is being prepared. We&apos;ll email you when it&apos;s ready to sign.</P>;
  }

  if (c.status === "signed") {
    return (
      <>
        <P>
          Signed{c.signed_at ? ` on ${new Date(c.signed_at).toLocaleDateString(undefined, { dateStyle: "long" })}` : ""}.
          {c.emailed_copy ? " A copy was emailed to you." : c.download_url ? " You can download your copy here any time." : ""}
        </P>
        {c.download_url && (
          <a href={c.download_url} target="_blank" rel="noreferrer" style={linkStyle}>
            Download signed contract
          </a>
        )}
        {!compact && c.document_id && (
          <P style={{ fontSize: 11, color: C.faint, marginTop: 12, marginBottom: 0, wordBreak: "break-all" }}>
            Document ID {c.document_id}
            <br />
            SHA-256 {c.signed_sha256}
          </P>
        )}
      </>
    );
  }

  const nameOk = c.legal_name_on_file
    ? name.trim().replace(/\s+/g, " ").toLowerCase() === c.legal_name_on_file.toLowerCase()
    : name.trim().length >= 2;
  const today = new Date().toLocaleDateString(undefined, { dateStyle: "long", timeZone: c.timezone });

  async function sign() {
    setBusy(true);
    setSignErr(null);
    try {
      await api("/api/creator/contract/sign", { consent, consent_text_version: c!.consent.version, typed_name: name, address });
      load();
      onSigned?.();
    } catch (e) {
      setSignErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <>
      <P>Read your contract all the way through. If anything&apos;s unclear, ask your manager on Slack before you sign.</P>
      <iframe
        src={c.document_url!}
        title="Your contract"
        style={{ width: "100%", height: "min(60vh, 520px)", border: C.border, borderRadius: 12, background: "#fff", marginBottom: 10 }}
      />
      <div style={{ marginBottom: 16 }}>
        <a href={c.document_url!} target="_blank" rel="noreferrer" style={linkStyle}>
          Open the full contract{c.template?.pages ? ` (${c.template.pages} pages)` : ""}
        </a>
      </div>

      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 8, padding: "6px 0", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 2, width: 22, height: 22, flexShrink: 0, accentColor: "#fff" }}
        />
        <span style={{ fontSize: 14, color: "#fff", lineHeight: 1.5 }}>{c.consent.label}</span>
      </label>
      <P style={{ fontSize: 12, color: C.faint, marginBottom: 14 }}>{c.consent.disclosure}</P>

      <Field label={c.legal_name_on_file ? `Type your full legal name (${c.legal_name_on_file})` : "Type your full legal name"}>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Full legal name" />
      </Field>
      <Field label="Home address (street, city, state, ZIP)">
        <input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
      </Field>
      <P style={{ fontSize: 13 }}>
        Date: <span style={{ color: "#fff" }}>{today}</span>
      </P>
      {/* Same handwriting font the signed PDF uses. */}
      <link rel="stylesheet" href={c.signature_font.css_url} />
      {name.trim() && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.faint, marginBottom: 4 }}>This is your signature</div>
          <div
            style={{
              background: "#fff",
              color: "#0d1a59",
              borderRadius: 10,
              padding: "10px 16px 6px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontFamily: `'${c.signature_font.family}', cursive`,
                fontSize: 40,
                lineHeight: 1.3,
                wordSpacing: "0.15em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                borderBottom: "1px solid #0d1a5966",
              }}
            >
              {adoptedSignatureText(name)}
            </div>
          </div>
        </div>
      )}
      <Msg error={signErr} />
      <Button disabled={!consent || !nameOk || address.trim().length < 6 || busy} onClick={sign} style={{ width: "100%" }}>
        {busy ? "Signing..." : "Adopt and sign"}
      </Button>
      <P style={{ fontSize: 12, color: C.faint, marginTop: 10, marginBottom: 0 }}>
        By pressing Adopt and sign you agree that the signature above is your electronic signature on this agreement, just like signing on
        paper. We&apos;ll email a signed copy to {c.email}.
      </P>
    </>
  );
}

export default function ContractTab() {
  return (
    <Card>
      <Eyebrow>Contract</Eyebrow>
      <H>Your contract</H>
      <ContractSigner />
    </Card>
  );
}
