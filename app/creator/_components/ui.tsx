"use client";

import type { CSSProperties, ReactNode } from "react";
import { MI, type MIName } from "./icons";

// Every value here is ported from the KESHAH Flutter app (~/KESHAH-Mobile-App/lib),
// not approximated. Flutter logical px = CSS px. Poppins only. The app's
// Poppins line box is 1.5x the font size (ascent + descent + line gap), so the
// portal sets line-height 1.5 at the root to get the same row heights.
//   lib/ui_helper/colors.dart                  colours
//   lib/screens/dashboard/dashboard_screen.dart     home header, section label, cards
//   lib/screens/dashboard/widgets/task_list_widget.dart  task rows
//   lib/screens/profile/profile_screen.dart     grouped rows, section labels, title
//   lib/screens/progress_tracker/progress_tracker_screen.dart  page title, stat cards
//   lib/widget/keshah_button.dart               buttons
//   lib/screens/auth/login/widget/keshah_textfield.dart  inputs
export const C = {
  bg: "#000",
  text: "#fff",
  /** kWhite at 0.6: secondary copy. */
  dim: "rgba(255,255,255,0.6)",
  /** kWhite at 0.4: hints, captions, chevrons. */
  faint: "rgba(255,255,255,0.4)",
  /** kWhite at 0.06: dashboard cards and finished task rows. */
  card: "rgba(255,255,255,0.06)",
  /** kWhite at 0.1 hairline around dashboard cards. */
  border: "1px solid rgba(255,255,255,0.1)",
  /** kBoxColor (#373737) at 0.9: a task row that still needs doing. */
  box: "rgba(55,55,55,0.9)",
  /** kBoxColor solid: text field fill, inactive nav icon. */
  kBox: "#373737",
  /** Color(0xFF141414): profile groups, progress stat cards, calendar. */
  group: "#141414",
  /** kWhite at 0.08: dividers inside groups. */
  divider: "rgba(255,255,255,0.08)",
  /** color359033: completion green. */
  green: "#359033",
  /** color959595: the task row's "Target" line. */
  grey: "#959595",
  /** Colors.redAccent: the text field error border colour. */
  red: "#FF5252",
  /** yellowTrackColor. */
  amber: "#DAA520",
  font: "'Poppins', -apple-system, sans-serif",
  radius: 16,
  /** Horizontal page padding on Home and Progress. */
  pad: 32,
};

// Flutter curves, as CSS easing functions.
export const EASE = {
  easeOut: "cubic-bezier(0, 0, 0.58, 1)",
  easeIn: "cubic-bezier(0.42, 0, 1, 1)",
  easeInOut: "cubic-bezier(0.42, 0, 0.58, 1)",
  easeOutCubic: "cubic-bezier(0.215, 0.61, 0.355, 1)",
  easeOutBack: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  linearToEaseOut: "cubic-bezier(0.35, 0.91, 0.33, 0.97)",
  fastEaseInToSlowEaseOut: "cubic-bezier(0.17, 0.67, 0.13, 1)",
  /** Curves.elasticOut (period 0.4), sampled at 41 points. */
  elasticOut:
    "linear(0, 0.223, 0.5, 0.772, 1, 1.161, 1.25, 1.275, 1.25, 1.194, 1.125, 1.057, 1, 0.96, 0.938, 0.931, 0.938, 0.951, 0.969, 0.986, 1, 1.01, 1.016, 1.017, 1.016, 1.012, 1.008, 1.004, 1, 0.997, 0.996, 0.996, 0.996, 0.997, 0.998, 0.999, 1, 1.001, 1.001, 1.001, 1)",
};

/**
 * Keyframes + reduced-motion rules the portal components rely on. Render once per page.
 *
 * cp-enter-N: the dashboard entrance (2000 ms controller; card i runs over
 *   Interval(0.2 + i * 0.08, +0.3): fade easeOut, scale 0.95 -> 1 easeOutBack,
 *   slide up from half its own height easeOutCubic).
 * cp-check: TaskListWidget's "Session complete" row (600 ms, scale elasticOut,
 *   fade over the first 40% easeOut).
 * cp-pulse: PulsePainter behind the next task (1500 ms repeat, the rounded rect
 *   grows by 20% of its height and fades from the row colour to clear).
 */
export const PORTAL_CSS = `
.cp-root, .cp-root * { box-sizing: border-box; }
.cp-root { line-height: 1.5; -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent; }
@keyframes cp-fade { from { opacity: 0 } }
@keyframes cp-scale95 { from { scale: 0.95 } }
@keyframes cp-slide-half { from { translate: 0 50% } }
@keyframes cp-scale0 { from { scale: 0 } }
@keyframes cp-pulse { from { inset: 0; opacity: 1 } to { inset: -11px; opacity: 0 } }
@keyframes cp-shimmer { 0% { opacity: 0.55 } 50% { opacity: 1 } 100% { opacity: 0.55 } }
@keyframes cp-push-in { from { transform: translateX(100%) } }
@keyframes cp-under { to { transform: translateX(-33.333%) } }
.cp-skel { animation: cp-shimmer 1.4s ease-in-out infinite; }
.cp-enter { animation: cp-fade 600ms ${EASE.easeOut} both, cp-scale95 600ms ${EASE.easeOutBack} both, cp-slide-half 600ms ${EASE.easeOutCubic} both; animation-delay: calc(400ms + var(--i, 0) * 160ms); }
.cp-head-enter { animation: cp-fade 400ms ${EASE.easeOut} both; }
.cp-fade-in { animation: cp-fade 480ms ${EASE.easeOut} both; animation-delay: calc(var(--i, 0) * 160ms); }
.cp-check { animation: cp-fade 240ms ${EASE.easeOut} both, cp-scale0 600ms ${EASE.elasticOut} both; transform-origin: center; }
.cp-pulse-wrap { position: relative; isolation: isolate; }
.cp-pulse-wrap::before { content: ""; position: absolute; inset: 0; border-radius: 10px; background: rgba(55,55,55,0.9); z-index: -1; animation: cp-pulse 1500ms linear infinite; pointer-events: none; }
.cp-btn { transition: opacity 0.12s ease; }
.cp-btn:not(:disabled):active { opacity: 0.7; }
.cp-btn:focus-visible, .cp-focus:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.cp-ink { transition: background-color 0.15s ease; }
.cp-ink:not(:disabled):active { background-color: rgba(255,255,255,0.06) !important; }
.cp-root input::placeholder, .cp-root textarea::placeholder { color: rgba(255,255,255,0.3); font-size: 14px; font-weight: 400; }
.cp-root input:disabled, .cp-root textarea:disabled { background: rgba(55,55,55,0.6); color: rgba(255,255,255,0.6); }
@media (prefers-reduced-motion: reduce) {
  .cp-enter, .cp-head-enter, .cp-fade-in, .cp-check, .cp-skel, .cp-pulse-wrap::before { animation: none !important; }
  .cp-pulse-wrap::before { display: none; }
}
`;

/** One of the app's Material icons (Icons.<name>), drawn from the real glyph. */
export function Icon({ name, size = 24, color = "currentColor", style }: { name: MIName; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: "block", flexShrink: 0, ...style }}>
      <path d={MI[name]} fill={color} />
    </svg>
  );
}

/** Placeholder block shown while data loads, sized like the content it stands in for. */
export function Skel({ h, w = "100%", r = 8, style }: { h: number; w?: number | string; r?: number; style?: CSSProperties }) {
  return <div className="cp-skel" aria-hidden style={{ height: h, width: w, borderRadius: r, background: "rgba(255,255,255,0.08)", ...style }} />;
}

/** True when the viewer asked for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Card-shaped loading placeholder: an eyebrow line and a few text lines. */
export function SkelCard({ lines = 2, height }: { lines?: number; height?: number }) {
  return (
    <div role="status" aria-label="Loading" style={{ background: C.card, border: C.border, borderRadius: 16, padding: 20, marginBottom: 16, minHeight: height }}>
      <Skel h={10} w={90} style={{ marginBottom: 14 }} />
      {Array.from({ length: lines }, (_, i) => (
        <Skel key={i} h={14} w={i === lines - 1 ? "60%" : "100%"} style={{ marginBottom: 10 }} />
      ))}
    </div>
  );
}

/** Dashboard card (_buildDayCompleteCard): kWhite 0.06, kWhite 0.1 hairline, radius 16. */
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: C.card, border: C.border, borderRadius: C.radius, padding: 20, marginBottom: 16, ...style }}>{children}</div>;
}

/** Profile / Progress surface: #141414, radius 14, no border. */
export function Group({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: C.group, borderRadius: 14, overflow: "hidden", ...style }}>{children}</div>;
}

/**
 * Section label (profile _buildSectionLabel / progress "ACTIVITY"):
 * 11px w500, kWhite 0.4, letterSpacing 1.5, uppercase.
 */
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: 1.5, textTransform: "uppercase", color: C.faint, marginBottom: 12, ...style }}>
      {children}
    </div>
  );
}

/** Home "TODAY'S ROUTINE" label: 11px w600, kWhite 0.35, letterSpacing 1.5, 20 below. */
export function SectionLabel({ children, right, style }: { children: ReactNode; right?: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.35)",
        marginBottom: 20,
        ...style,
      }}
    >
      <span>{children}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

export function H({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, ...style }}>{children}</div>;
}

/** Page title ("Progress", "Profile"): 28px w700, letterSpacing -1.2. */
export function Title({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1.2, marginBottom: 32, ...style }}>{children}</div>;
}

/** Home "All done.": 36px w700, color359033, letterSpacing -1.5, height 1.0. */
export function AllDone({ children = "All done.", style }: { children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1, color: C.green, ...style }}>{children}</div>;
}

export function P({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  // Longhand margins only: callers override marginBottom/marginTop, and mixing
  // those with the `margin` shorthand makes React warn on re-render.
  return (
    <p style={{ fontSize: 14, lineHeight: 1.5, color: C.dim, marginTop: 0, marginRight: 0, marginLeft: 0, marginBottom: 10, ...style }}>
      {children}
    </p>
  );
}

/**
 * KeshahButton: radius 40, padding 15, Poppins 14 w400. Primary is the white
 * fill with black text; ghost is `filled: false` (transparent, 1px kWhite border).
 */
export function buttonStyle(variant: "primary" | "ghost" = "primary", disabled = false): CSSProperties {
  const primary = variant === "primary";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 51,
    padding: "15px 15px",
    borderRadius: 40,
    border: primary ? "1px solid #fff" : "1px solid #fff",
    background: primary ? "#fff" : "transparent",
    color: primary ? "#000" : "#fff",
    fontFamily: C.font,
    fontSize: 14,
    fontWeight: 400,
    lineHeight: "21px",
    textAlign: "center",
    textDecoration: "none",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
    transition: "background-color 300ms, opacity 0.12s",
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

/** KeshahTextField: kBoxColor fill and border, radius 10, 20 left padding, white 16px text. */
export const inputStyle: CSSProperties = {
  width: "100%",
  height: 48,
  padding: "0 16px 0 20px",
  background: C.kBox,
  border: `1px solid ${C.kBox}`,
  borderRadius: 10,
  color: "#fff",
  caretColor: "#fff",
  fontFamily: C.font,
  // 16px (the app's field text size) also stops iOS Safari zooming on focus.
  fontSize: 16,
  outline: "none",
  colorScheme: "dark",
};

/** KeshahTextField with topLabelStyle: label 16px w600 white, 10 above the field. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 20 }}>
      <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 10 }}>{label}</span>
      {children}
    </label>
  );
}

export function Msg({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) return <p role="alert" style={{ color: C.red, fontSize: 13, lineHeight: 1.5, margin: "10px 0" }}>{error}</p>;
  if (ok) return <p role="status" style={{ color: C.green, fontSize: 13, lineHeight: 1.5, margin: "10px 0" }}>{ok}</p>;
  return null;
}

/** Home streak chip: 1.5px outline, radius 20, padding 4/10, white 12px w400. */
export function Pill({ children, color = C.dim }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 12,
        fontWeight: 400,
        lineHeight: 1.5,
        padding: "4px 10px",
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

/** JourneyProgressBar track: 6px, radius 3, kWhite 0.1 under the fill. */
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

/** Icons.check_circle_rounded in color359033. `pop` plays the elasticOut scale-in. */
export function CheckCircle({ size = 14, pop = false, color = C.green }: { size?: number; pop?: boolean; color?: string }) {
  return (
    <svg className={pop ? "cp-check" : undefined} width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0, display: "block" }}>
      <path d={MI.checkCircle} fill={color} />
    </svg>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, ...style }}>{children}</div>;
}

/**
 * Profile _ProfileRow: padding 16/20, label 14 w400 white, optional 12px
 * kWhite 0.35 subtitle, 13px kWhite 0.5 trailing text, chevron_right_rounded
 * 20 at kWhite 0.4, and a 1px kWhite 0.08 divider unless it's the last row.
 */
export function ProfileRow({
  label,
  subtitle,
  trailing,
  onClick,
  href,
  isLast,
  chevron = true,
}: {
  label: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  isLast?: boolean;
  chevron?: boolean;
}) {
  const inner = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "#fff" }}>{label}</span>
        {subtitle && <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2, wordBreak: "break-word" }}>{subtitle}</span>}
      </span>
      {trailing !== undefined && trailing !== null && (
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginRight: chevron ? 8 : 0, flexShrink: 0 }}>{trailing}</span>
      )}
      {chevron && <Icon name="chevronRight" size={20} color={C.faint} />}
    </>
  );
  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    width: "100%",
    padding: "16px 20px",
    background: "transparent",
    border: "none",
    borderBottom: isLast ? "none" : `1px solid ${C.divider}`,
    color: "#fff",
    fontFamily: C.font,
    textAlign: "left",
    textDecoration: "none",
    cursor: onClick || href ? "pointer" : "default",
  };
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className="cp-ink cp-focus" style={style}>
        {inner}
      </a>
    );
  if (!onClick) return <div style={style}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} className="cp-ink cp-focus" style={style}>
      {inner}
    </button>
  );
}

/** Progress _StatCard: #141414, radius 14, 20 vertical padding, value 28 w700, label 10 w500 kWhite 0.4 spacing 1.0. */
export function StatCard({ label, value, color, sub }: { label: string; value: ReactNode; color?: string; sub?: ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: C.group, borderRadius: 14, padding: "20px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: color ?? "#fff", whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 1, color: C.faint, marginTop: 6, textTransform: "uppercase" }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Progress screen separator: full width, 1px, kWhite 0.08. */
export function Separator({ style }: { style?: CSSProperties }) {
  return <div style={{ height: 1, background: C.divider, margin: "40px 0 32px", ...style }} />;
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
