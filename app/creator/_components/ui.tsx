"use client";

import type { CSSProperties, ReactNode } from "react";

export const C = {
  bg: "#000",
  text: "#fff",
  dim: "rgba(255,255,255,0.6)",
  faint: "rgba(255,255,255,0.4)",
  card: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  green: "#4ade80",
  red: "#f87171",
  amber: "#fbbf24",
  font: "'Poppins', -apple-system, sans-serif",
};

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: C.card, border: C.border, borderRadius: 18, padding: 18, marginBottom: 14, ...style }}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: C.faint,
        marginBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function H({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6, ...style }}>{children}</div>;
}

export function P({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <p style={{ fontSize: 14, lineHeight: 1.55, color: C.dim, margin: "0 0 10px", ...style }}>{children}</p>;
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
  type?: "button" | "submit";
  style?: CSSProperties;
}) {
  const primary = variant === "primary";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "12px 18px",
        borderRadius: 12,
        border: primary ? "none" : C.border,
        background: primary ? "#fff" : "transparent",
        color: primary ? "#000" : "#fff",
        fontFamily: C.font,
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  color: "#fff",
  fontFamily: C.font,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  colorScheme: "dark",
};

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: 12, color: C.faint, marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

export function Msg({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) return <p style={{ color: C.red, fontSize: 13, margin: "8px 0" }}>{error}</p>;
  if (ok) return <p style={{ color: C.green, fontSize: 13, margin: "8px 0" }}>{ok}</p>;
  return null;
}

export function Pill({ children, color = C.dim }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, ...style }}>{children}</div>
  );
}

export async function api<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? { cache: "no-store" } : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) {
    window.location.href = "/creator/login";
    throw new Error("Please sign in again.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "Something went wrong.");
  return json as T;
}

export const statusColor: Record<string, string> = {
  posted: C.green,
  off: C.green,
  approved: C.green,
  paid: C.green,
  missed: C.red,
  declined: C.red,
  rejected: C.red,
  pending: C.faint,
  off_requested: C.amber,
  requested: C.amber,
  claimed: C.amber,
  draft: C.faint,
  submitted: C.amber,
};
