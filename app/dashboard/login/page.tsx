"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"admin" | "manager">("admin");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const body: Record<string, string> = { password };
    if (mode === "manager") body.email = email;

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.role === "manager") {
        router.push("/dashboard/today");
      } else {
        router.push("/dashboard");
      }
    } else {
      setError("Wrong credentials");
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    color: "#fff",
    fontSize: 15,
    outline: "none",
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "10px 0",
    background: active ? "rgba(255,255,255,0.08)" : "transparent",
    border: "none",
    borderRadius: 8,
    color: active ? "#fff" : "rgba(255,255,255,0.35)",
    fontSize: 13,
    fontWeight: active ? 500 : 400,
    cursor: "pointer",
    transition: "all 0.15s",
  });

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
            Sign in to continue
          </p>
        </div>

        {/* Role toggle */}
        <div style={{
          display: "flex",
          gap: 4,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 10,
          padding: 4,
        }}>
          <button type="button" onClick={() => setMode("admin")} style={tabStyle(mode === "admin")}>
            Admin
          </button>
          <button type="button" onClick={() => setMode("manager")} style={tabStyle(mode === "manager")}>
            Manager
          </button>
        </div>

        {mode === "manager" && (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoFocus
            style={inputStyle}
          />
        )}

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus={mode === "admin"}
          style={inputStyle}
        />

        {error && (
          <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !password || (mode === "manager" && !email)}
          style={{
            width: "100%",
            padding: "14px 0",
            background: loading ? "rgba(255,255,255,0.1)" : "#fff",
            color: loading ? "rgba(255,255,255,0.3)" : "#000",
            fontSize: 15,
            fontWeight: 500,
            borderRadius: 40,
            border: "none",
            cursor: loading ? "default" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <a
          href="/creator/login"
          style={{
            display: "block",
            textAlign: "center",
            fontSize: 12,
            color: "rgba(255,255,255,0.3)",
            textDecoration: "none",
            marginTop: 4,
          }}
        >
          Creator? Sign in here &rarr;
        </a>
      </form>
    </div>
  );
}
