"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, C, Card, Eyebrow, Field, H, Msg, P, api, inputStyle } from "./ui";

interface ContractInfo {
  status: "none" | "sent" | "signed";
  signed_at: string | null;
  signed_sha256: string | null;
  document_id: string | null;
  template: { version: string; title: string; pages: number } | null;
  download_url: string | null;
  document_url: string | null;
  legal_name_on_file: string;
  email: string;
  timezone: string;
  consent: { version: string; label: string; disclosure: string };
}

const linkStyle = {
  padding: "12px 18px",
  borderRadius: 12,
  border: C.border,
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
} as const;

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
          Signed{c.signed_at ? ` on ${new Date(c.signed_at).toLocaleDateString(undefined, { dateStyle: "long" })}` : ""}. A copy was emailed to
          you.
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
        style={{ width: "100%", height: 420, border: C.border, borderRadius: 12, background: "#fff", marginBottom: 10 }}
      />
      <div style={{ marginBottom: 16 }}>
        <a href={c.document_url!} target="_blank" rel="noreferrer" style={linkStyle}>
          Open the full contract{c.template?.pages ? ` (${c.template.pages} pages)` : ""}
        </a>
      </div>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, accentColor: "#fff" }}
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
      {name.trim() && (
        <div
          style={{
            fontFamily: "'Times New Roman', Times, serif",
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 26,
            borderBottom: "1px solid rgba(255,255,255,0.4)",
            padding: "4px 2px",
            marginBottom: 12,
          }}
        >
          {name.trim()}
        </div>
      )}
      <Msg error={signErr} />
      <Button disabled={!consent || !nameOk || address.trim().length < 6 || busy} onClick={sign} style={{ width: "100%" }}>
        {busy ? "Signing..." : "Sign contract"}
      </Button>
      <P style={{ fontSize: 12, color: C.faint, marginTop: 10, marginBottom: 0 }}>
        By pressing Sign contract you&apos;re signing this agreement electronically. We&apos;ll email a signed copy to {c.email}.
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
