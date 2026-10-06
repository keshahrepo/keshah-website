"use client";

import { useEffect, useState } from "react";
import { Card, Eyebrow, H, P, api } from "./ui";

interface ContractInfo {
  status: "none" | "sent" | "signed";
  signed_at: string | null;
  download_url: string | null;
}

const text: Record<ContractInfo["status"], string> = {
  none: "Your contract hasn't been sent yet.",
  sent: "Your contract has been sent. Check your email to sign it.",
  signed: "Your contract is signed.",
};

export default function ContractTab() {
  const [c, setC] = useState<ContractInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<ContractInfo>("/api/creator/contract").then(setC, (e) => setErr(e.message));
  }, []);
  return (
    <Card>
      <Eyebrow>Contract</Eyebrow>
      {!c ? (
        <P style={{ marginBottom: 0 }}>{err ?? "Loading..."}</P>
      ) : (
        <>
          <H>{text[c.status]}</H>
          {c.signed_at && <P>Signed on {new Date(c.signed_at).toLocaleDateString()}.</P>}
          {c.download_url && (
            <a href={c.download_url} target="_blank" rel="noreferrer" style={{ color: "#fff", fontSize: 14 }}>
              Download PDF
            </a>
          )}
        </>
      )}
    </Card>
  );
}
