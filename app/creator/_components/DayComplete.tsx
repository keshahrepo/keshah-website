"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { DayComplete as DayCompleteData } from "@/lib/creators/pay";
import { fmtMoney } from "@/lib/creators/time";
import { COLUMN } from "./AppShell";
import { C, EASE, Icon, prefersReducedMotion } from "./ui";

// Ported from the KESHAH app's day-complete screen:
//   lib/screens/streak_update/new_streak_update_page.dart (NewStreakUpdatePage)
//   lib/widget/title_widgets.dart (BackArrowWithAppLogo, logoScale 0.85, no back)
// Black page, centred logo, then 32px side padding: "Day complete." heading,
// the big green glowing number (72 w500, color359033 with a 0xFF4ADE80 blur-24
// shadow) with its 18px label, a kWhite 0.06 card where the week calendar sits,
// a "tomorrow" style card, and the white pill button 35 from the bottom.
// Entrance: one 1800 ms controller, each section fades in and slides up 24px
// over Interval(start, end, easeOut):
//   heading 0-0.25, number 0.12-0.40, card 0.28-0.55, next card 0.42-0.68, button 0.55-0.80.
// The numbers count up while their section comes in (easeOutCubic).

const CONTROLLER_MS = 1800;
const SECTIONS = {
  heading: [0, 0.25],
  number: [0.12, 0.4],
  card: [0.28, 0.55],
  next: [0.42, 0.68],
  button: [0.55, 0.8],
} as const;
type Section = keyof typeof SECTIONS;

const COUNT_MS = 900;

/** localStorage key that marks the screen as shown for this creator and day. */
export function dayCompleteKey(creator: string, date: string): string {
  return `cp-day-complete:${creator}:${date}`;
}

/** True if the screen was already shown for this creator and day. Storage errors count as not shown. */
export function dayCompleteSeen(creator: string, date: string): boolean {
  try {
    return window.localStorage.getItem(dayCompleteKey(creator, date)) === "1";
  } catch {
    return false;
  }
}

export function markDayCompleteSeen(creator: string, date: string): void {
  try {
    window.localStorage.setItem(dayCompleteKey(creator, date), "1");
  } catch {
    // Private mode or blocked storage: it may show again, which is fine.
  }
}

function sectionStyle(s: Section, reduce: boolean): CSSProperties {
  if (reduce) return {};
  const [a, b] = SECTIONS[s];
  return { animation: `cp-dc-in ${Math.round((b - a) * CONTROLLER_MS)}ms ${EASE.easeOut} ${Math.round(a * CONTROLLER_MS)}ms both` };
}

/** Counts from `from` to `to` cents, starting after `delay` ms. Final value at once when `reduce`. */
function useCountUp(from: number, to: number, delay: number, reduce: boolean): number {
  const [v, setV] = useState(reduce ? to : from);
  useEffect(() => {
    if (reduce) {
      setV(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - t0) / COUNT_MS));
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setV(Math.round(from + (to - from) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, delay, reduce]);
  return v;
}

/** Money while counting: whole dollars until the final value, so the width doesn't jump between cents and none. */
function countMoney(v: number, final: number): string {
  return v === final ? fmtMoney(final) : fmtMoney(final % 100 === 0 ? Math.round(v / 100) * 100 : v);
}

function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

/** The app's tomorrow cards: kWhite 0.06, kWhite 0.08 hairline, radius 14, padding 18. */
function InfoCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ width: "100%", padding: 18, background: C.card, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, ...style }}>{children}</div>
  );
}

/** 10px w600 kWhite 0.3, letterSpacing 1.2 ("UNLOCKS TOMORROW"). */
function CardEyebrow({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.2, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>{children}</div>;
}

export const DAY_COMPLETE_CSS = `
@keyframes cp-dc-in { from { opacity: 0; transform: translateY(24px) } }
@keyframes cp-dc-page { from { opacity: 0 } }
@media (prefers-reduced-motion: reduce) { .cp-dc, .cp-dc * { animation: none !important; transition: none !important; } }
`;

export default function DayComplete({ data, onDone }: { data: DayCompleteData; onDone: () => void }) {
  const [reduce] = useState(prefersReducedMotion);
  const root = useRef<HTMLDivElement>(null);
  const delay = (s: Section) => SECTIONS[s][0] * CONTROLLER_MS;
  const day = useCountUp(0, data.dayPayCents, delay("number"), reduce);
  const earnedFrom = Math.max(0, data.monthEarnedCents - data.dayPayCents);
  const earned = useCountUp(earnedFrom, data.monthEarnedCents, delay("card"), reduce);
  const pct = data.monthBaseCents > 0 ? Math.max(0, Math.min(1, earned / data.monthBaseCents)) * 100 : 0;

  useEffect(() => {
    root.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onDone]);

  const host = typeof document !== "undefined" ? document.getElementById("cp-screens") : null;
  const node = (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Day complete"
      tabIndex={-1}
      className="cp-dc"
      style={{
        position: "fixed",
        inset: 0,
        margin: "0 auto",
        maxWidth: COLUMN,
        zIndex: 60,
        background: C.bg,
        color: C.text,
        fontFamily: C.font,
        overflowY: "auto",
        overscrollBehavior: "contain",
        outline: "none",
        display: "flex",
        flexDirection: "column",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        animation: reduce ? undefined : `cp-dc-page 200ms ${EASE.easeOut} both`,
      }}
    >
      <style>{DAY_COMPLETE_CSS}</style>
      {/* BackArrowWithAppLogo: 8 top, kToolbarHeight row, the 130x60 logo box at 0.85, centred. */}
      <div style={{ paddingTop: 8, height: 64, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img src="/images/keshah-wordmark-white.png" alt="KESHAH" width={52} height={16} style={{ display: "block", width: 52, height: "auto" }} />
      </div>
      <div style={{ height: 16, flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 32px" }}>
        <div style={sectionStyle("heading", reduce)}>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: -1.2, lineHeight: 1.2 }}>Day complete.</div>
          <div style={{ height: 6 }} />
          <div style={{ fontSize: 15, fontWeight: 400, letterSpacing: -0.2, color: "rgba(255,255,255,0.45)" }}>All 5 videos are in, so today counts.</div>
        </div>

        <div style={{ height: 36, flexShrink: 0 }} />

        <div style={sectionStyle("number", reduce)}>
          <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }} aria-label={`Plus ${fmtMoney(data.dayPayCents)} today`}>
            <span
              aria-hidden
              style={{
                // 72 as in the app; a little smaller on narrow phones so "today" stays on the same line.
                fontSize: "min(72px, 15vw)",
                fontWeight: 500,
                lineHeight: 1,
                color: C.green,
                // Shadow(blurRadius: 24): sigma = 24 x 0.57735 + 0.5 = 14.4, and CSS blur is 2 x sigma.
                textShadow: "0 0 29px #4ADE80",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              +{countMoney(day, data.dayPayCents)}
            </span>
            <span style={{ width: 12 }} />
            <span aria-hidden style={{ fontSize: 18, fontWeight: 400, lineHeight: 1, color: "rgba(53,144,51,0.7)" }}>
              today
            </span>
          </div>
          {data.streak >= 2 && (
            <span
              style={{
                display: "inline-block",
                marginTop: 16,
                padding: "4px 10px",
                borderRadius: 20,
                border: `1.5px solid ${C.green}`,
                fontSize: 12,
                fontWeight: 400,
                lineHeight: "18px",
                color: "#fff",
                whiteSpace: "nowrap",
              }}
            >
              {data.streak}-day streak
            </span>
          )}
        </div>

        <div style={{ height: 32, flexShrink: 0 }} />

        {/* Where the app shows the week calendar: kWhite 0.06, kWhite 0.08 hairline, radius 16. */}
        <div style={sectionStyle("card", reduce)}>
          <div style={{ background: C.card, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums" }}>{countMoney(earned, data.monthEarnedCents)}</span>
              <span style={{ width: 6 }} />
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>earned this month</span>
            </div>
            <div
              role="progressbar"
              aria-label="Base pay earned this month"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
              style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden", marginTop: 14 }}
            >
              <div style={{ width: `${pct}%`, height: "100%", background: C.green, borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 10 }}>
              Your full month is {fmtMoney(data.monthBaseCents)}.
            </div>
          </div>
        </div>

        {data.nextLevel && (
          <>
            <div style={{ height: 24, flexShrink: 0 }} />
            <div style={sectionStyle("next", reduce)}>
              <InfoCard style={{ display: "flex", alignItems: "center" }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name="payments" size={17} color="rgba(255,255,255,0.5)" />
                </span>
                <span style={{ width: 14, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <CardEyebrow>Next raise</CardEyebrow>
                  <span style={{ display: "block", height: 3 }} />
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>
                    You move up to {fmtMoney(data.nextLevel.nextBaseCents)} a month from {monthName(data.nextLevel.earliestMonth)}
                  </span>
                </span>
              </InfoCard>
            </div>
          </>
        )}

        <div style={{ flex: 1, minHeight: 32 }} />

        <div style={sectionStyle("button", reduce)}>
          <button
            type="button"
            className="cp-btn cp-focus"
            onClick={() => {
              try {
                navigator.vibrate?.(10); // HapticFeedback.lightImpact
              } catch {
                // not supported
              }
              onDone();
            }}
            style={{
              width: "100%",
              padding: "18px 0",
              background: "#fff",
              color: "#000",
              border: "none",
              borderRadius: 40,
              fontFamily: C.font,
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.5,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
        <div style={{ height: 35, flexShrink: 0 }} />
      </div>
    </div>
  );
  return host ? createPortal(node, host) : node;
}
