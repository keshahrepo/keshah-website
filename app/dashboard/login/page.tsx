"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/dashboard");
    } else {
      setError("Wrong password");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#000",
      padding: 24,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: "100%",
        maxWidth: 360,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <h1 style={{
            fontSize: 20,
            fontWeight: 600,
            color: "#fff",
            letterSpacing: "-0.3px",
          }}>
            KESHAH Dashboard
          </h1>
          <p style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.4)",
            marginTop: 4,
          }}>
            Enter password to continue
          </p>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{
            width: "100%",
            padding: "14px 16px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            color: "#fff",
            fontSize: 15,
            outline: "none",
          }}
        />

        {error && (
          <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          style={{
            width: "100%",
            padding: "14px 0",
            background: loading || !password ? "rgba(255,255,255,0.1)" : "#fff",
            color: loading || !password ? "rgba(255,255,255,0.3)" : "#000",
            fontSize: 15,
            fontWeight: 500,
            borderRadius: 40,
            border: "none",
            cursor: loading || !password ? "default" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
