"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 14,
  color: "#fff",
  fontSize: 16,
  minHeight: 48,
  outline: "none",
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.6)", display: "block", marginBottom: 6 };
const box: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 16,
  padding: 28,
};

export default function SetPasswordPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ margin: "0 0 10px", display: "flex", justifyContent: "center" }}><img src="/images/keshah-wordmark-white.png" alt="KESHAH" width={96} height={30} style={{ display: "block", height: 30, width: "auto" }} /></h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Creator Portal</p>
        </div>
        <Suspense fallback={<div style={box} />}>
          <SetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}

function SetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [check, setCheck] = useState<{ first_name?: string; error?: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/creator/set-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(setCheck)
      .catch(() => setCheck({ error: "Couldn't check your link. Refresh the page to try again." }));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Those two passwords don't match.");
    setLoading(true);
    const res = await fetch("/api/creator/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    }).catch(() => null);
    if (!res) {
      setError("Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
      return;
    }
    if (res.ok) {
      router.push("/creator");
      return;
    }
    const j = await res.json().catch(() => ({}));
    setError(j.error || "Something went wrong. Try again in a minute.");
    setLoading(false);
  }

  if (!check) return <div style={{ ...box, color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center" }}>Checking your link...</div>;

  if (check.error) {
    return (
      <div style={box}>
        <p style={{ color: "#fff", fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>{check.error}</p>
        <a
          href="/creator/login"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 50, borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", fontSize: 15, fontWeight: 500, color: "#fff", textDecoration: "none" }}
        >
          Go to the login page
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={box}>
      <p style={{ color: "#fff", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
        {check.first_name ? `Welcome, ${check.first_name}.` : "Welcome."}
      </p>
      <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
        Pick a password for your creator portal. You&apos;ll use it with your email to log in from now on.
      </p>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="sp-new" style={labelStyle}>New password</label>
        <input id="sp-new" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" style={inputStyle} />
      </div>
      <div style={{ marginBottom: 24 }}>
        <label htmlFor="sp-again" style={labelStyle}>Type it again</label>
        <input id="sp-again" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} style={inputStyle} />
      </div>
      {error && <p role="alert" style={{ color: "#f87171", fontSize: 14, marginBottom: 16, textAlign: "center" }}>{error}</p>}
      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          minHeight: 50,
          padding: "12px 0",
          background: "#fff",
          color: "#000",
          fontSize: 15,
          fontWeight: 500,
          borderRadius: 999,
          border: "none",
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Saving..." : "Set password and log in"}
      </button>
    </form>
  );
}
