"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";

interface ContractData {
  id: string;
  template_title: string;
  recipient_name: string;
  content: string;
  status: string;
  signed_name: string | null;
  signed_at: string | null;
}

export default function SignContractPage() {
  const { token } = useParams<{ token: string }>();
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signedName, setSignedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  useEffect(() => {
    fetch(`/api/contracts/sign?token=${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setContract(data);
        if (data.status === "signed") setDone(true);
      })
      .catch(() => setError("This signing link is invalid or has expired."))
      .finally(() => setLoading(false));
  }, [token]);

  function handleScroll() {
    if (!contentRef.current) return;
    const el = contentRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (atBottom) setScrolledToBottom(true);
  }

  async function handleSign() {
    if (!signedName.trim() || !agreed) return;
    setSigning(true);
    const res = await fetch("/api/contracts/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, signed_name: signedName }),
    });
    if (res.ok) {
      setDone(true);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to sign");
    }
    setSigning(false);
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <p style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", paddingTop: 100 }}>Loading...</p>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: "center", paddingTop: 100 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#fff", marginBottom: 8 }}>KESHAH</h1>
          <p style={{ color: "#f87171", fontSize: 14 }}>{error || "Not found"}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 500, margin: "0 auto", padding: "60px 16px", textAlign: "center" }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            background: "rgba(74,222,128,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
          }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2.5}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            Contract Signed
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
            {contract.template_title}
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
            Signed by {contract.signed_name || signedName} {contract.signed_at ? `on ${new Date(contract.signed_at).toLocaleDateString()}` : "just now"}
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginTop: 24 }}>
            You can close this page. Your manager will be in touch with next steps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
            KESHAH
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
            {contract.template_title}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            Prepared for {contract.recipient_name}
          </p>
        </div>

        {/* Contract content */}
        <div
          ref={contentRef}
          onScroll={handleScroll}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: "24px 20px",
            maxHeight: 400,
            overflowY: "auto",
            marginBottom: 24,
          }}
        >
          <pre style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.75)",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            fontFamily: "inherit",
          }}>
            {contract.content}
          </pre>
        </div>

        {!scrolledToBottom && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", marginBottom: 16 }}>
            Scroll to read the full contract before signing
          </p>
        )}

        {/* Signing section */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "24px 20px",
          opacity: scrolledToBottom ? 1 : 0.4,
          pointerEvents: scrolledToBottom ? "auto" : "none",
          transition: "opacity 0.3s",
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>
            Sign this agreement
          </h3>

          {/* Full legal name */}
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>
            Type your full legal name
          </label>
          <input
            type="text"
            placeholder={contract.recipient_name}
            value={signedName}
            onChange={(e) => setSignedName(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              color: "#fff",
              fontSize: 16,
              fontStyle: "italic",
              outline: "none",
              marginBottom: 16,
              boxSizing: "border-box",
            }}
          />

          {/* Agreement checkbox */}
          <label style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            cursor: "pointer",
            marginBottom: 20,
          }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: 2, accentColor: "#818cf8" }}
            />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
              I, <strong style={{ color: "#fff" }}>{signedName || contract.recipient_name}</strong>, have read and agree to the terms of this agreement. I understand that typing my name constitutes a legally binding electronic signature.
            </span>
          </label>

          {/* Sign button */}
          <button
            onClick={handleSign}
            disabled={!signedName.trim() || !agreed || signing}
            style={{
              width: "100%",
              padding: "14px 0",
              background: (!signedName.trim() || !agreed) ? "rgba(255,255,255,0.06)" : "#818cf8",
              color: (!signedName.trim() || !agreed) ? "rgba(255,255,255,0.3)" : "#fff",
              fontSize: 15,
              fontWeight: 600,
              borderRadius: 10,
              border: "none",
              cursor: (!signedName.trim() || !agreed) ? "default" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {signing ? "Signing..." : "Sign Agreement"}
          </button>

          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: 12 }}>
            Your IP address and timestamp will be recorded as proof of signature.
          </p>
        </div>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#000",
  color: "#fff",
};
