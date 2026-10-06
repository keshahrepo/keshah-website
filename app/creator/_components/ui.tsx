"use client";

import type { CSSProperties, ReactNode } from "react";

// Visual language copied from the KESHAH app dashboard (Flutter):
// Poppins only, black ground, white text, translucent white cards with a
// hairline border, #373737 for tasks still to do, #359033 for done.
export const C = {
  bg: "#000",
  text: "#fff",
  dim: "rgba(255,255,255,0.6)",
  faint: "rgba(255,255,255,0.4)",
  card: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  /** App kBoxColor at 0.9: a task row that still needs doing. */
  box: "rgba(55,55,55,0.9)",
  /** App color359033: completion green ("All done.", check circles, streak chip). */
  green: "#359033",
  red: "#f87171",
  amber: "#fbbf24",
  font: "'Poppins', -apple-system, sans-serif",
  radius: 16,
};

/** Keyframes + reduced-motion rules the portal components rely on. Render once per page. */
export const PORTAL_CSS = `
@keyframes cp-pop { 0% { transform: scale(0); opacity: 0 } 40% { opacity: 1 } 55% { transform: scale(1.18) } 72% { transform: scale(0.92) } 86% { transform: scale(1.04) } 100% { transform: scale(1) } }
@keyframes cp-pulse { 0% { box-shadow: 0 0 0 0 rgba(55,55,55,0.9) } 100% { box-shadow: 0 0 0 14px rgba(55,55,55,0) } }
@keyframes cp-rise { 0% { transform: translateY(10px); opacity: 0 } 100% { transform: none; opacity: 1 } }
@keyframes cp-fill { from { width: 0 } }
.cp-pop { animation: cp-pop 0.6s ease-out both; }
.cp-pulse { animation: cp-pulse 1.5s ease-out infinite; }
.cp-rise { animation: cp-rise 0.45s ease-out both; }
.cp-btn { transition: transform 0.12s ease, opacity 0.12s ease; }
.cp-btn:not(:disabled):active { transform: scale(0.97); }
.cp-btn:focus-visible, .cp-focus:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .cp-pop, .cp-pulse, .cp-rise { animation: none !important; }
  .cp-btn, .cp-btn:active { transition: none; transform: none; }
}
`;

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: C.card, border: C.border, borderRadius: C.radius, padding: 20, marginBottom: 14, ...style }}>
      {children}
    </div>
  );
}

/** Small caps label, like the app's "PHASE 1" labels. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.45)",
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

/** Big page headline, the app's "All done." scale. */
export function Title({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, lineHeight: 1.1, marginBottom: 8, ...style }}>{children}</div>
  );
}

export function P({ children, style }: { children: ReactNode; style?: CSSProperties }) {
    // Longhand margins only: callers override marginBottom/marginTop, and mixing
  // those with the `margin` shorthand makes React warn on re-render.
  return (
    <p style={{ fontSize: 14, lineHeight: 1.55, color: C.dim, marginTop: 0, marginRight: 0, marginLeft: 0, marginBottom: 10, ...style }}>
      {children}
    </p>
  );
}

/** App KeshahButton: white pill with black text; ghost is the outlined pill. */
export function buttonStyle(variant: "primary" | "ghost" = "primary", disabled = false): CSSProperties {
  const primary = variant === "primary";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxSizing: "border-box",
    minHeight: 50,
    padding: "13px 22px",
    borderRadius: 999,
    border: primary ? "1px solid #fff" : "1px solid rgba(255,255,255,0.2)",
    background: primary ? "#fff" : "rgba(255,255,255,0.04)",
    color: primary ? "#000" : "#fff",
    fontFamily: C.font,
    fontSize: 15,
    fontWeight: 500,
    textDecoration: "none",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
  };
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
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="cp-btn" style={{ ...buttonStyle(variant, disabled), ...style }}>
      {children}
    </button>
  );
}

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 14,
  color: "#fff",
  fontFamily: C.font,
  // 16px or iOS Safari zooms the page when the field is focused.
  fontSize: 16,
  minHeight: 50,
  outline: "none",
  boxSizing: "border-box",
  colorScheme: "dark",
};

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 13, color: C.dim, marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

export function Msg({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) return <p role="alert" style={{ color: C.red, fontSize: 14, lineHeight: 1.5, margin: "10px 0" }}>{error}</p>;
  if (ok) return <p role="status" style={{ color: C.green, fontSize: 14, lineHeight: 1.5, margin: "10px 0" }}>{ok}</p>;
  return null;
}

/** App streak chip: 1.5px coloured outline, white text. */
export function Pill({ children, color = C.dim }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 12,
        fontWeight: 500,
        padding: "3px 10px",
        borderRadius: 20,
        border: `1.5px solid ${color}`,
        color: "#fff",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** App JourneyProgressBar track: 6px, white fill on 10% white. */
export function ProgressBar({ value, color = "#fff", style }: { value: number; color?: string; style?: CSSProperties }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden", ...style }}
    >
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
    </div>
  );
}

/** App check_circle_rounded in completion green. `pop` plays the elastic scale-in. */
export function CheckCircle({ size = 20, pop = false, color = C.green }: { size?: number; pop?: boolean; color?: string }) {
  return (
    <svg className={pop ? "cp-pop" : undefined} width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0, display: "block" }}>
      <circle cx="12" cy="12" r="11" fill={color} />
      <path d="M7 12.4l3.2 3.2L17 8.8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
