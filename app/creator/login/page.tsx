"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreatorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, login_type: "creator" }),
    });

    if (res.ok) {
      router.push("/creator");
    } else {
      setError("Invalid email or password");
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px", marginBottom: 4 }}>
            KESHAH
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Creator Portal</p>
        </div>

        <form onSubmit={handleSubmit} style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          padding: 28,
        }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }} htmlFor="cl-email">
              Email
            </label>
            <input
              id="cl-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
              autoComplete="email"
              autoCapitalize="none"
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                color: "#fff",
                fontSize: 16,
                minHeight: 48,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }} htmlFor="cl-password">
              Password
            </label>
            <input
              id="cl-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                color: "#fff",
                fontSize: 16,
                minHeight: 48,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <p role="alert" style={{ color: "#f87171", fontSize: 14, marginBottom: 16, textAlign: "center" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              minHeight: 48,
              padding: "12px 0",
              background: "#fff",
              color: "#000",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 10,
              border: "none",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", margin: "16px 0 0", lineHeight: 1.5 }}>
            Forgot your password? Message your manager on Slack and they&apos;ll send you a new link.
          </p>
        </form>

        <a
          href="/dashboard/login"
          style={{
            display: "block",
            textAlign: "center",
            fontSize: 13,
            color: "rgba(255,255,255,0.4)",
            textDecoration: "none",
            marginTop: 8,
            padding: "12px 0",
          }}
        >
          Manager or admin? Sign in here &rarr;
        </a>
      </div>
    </div>
  );
}
