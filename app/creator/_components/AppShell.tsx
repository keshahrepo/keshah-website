"use client";

import { createPortal } from "react-dom";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { C, CheckCircle, EASE, Icon, Title, prefersReducedMotion } from "./ui";
import type { MIName } from "./icons";

// The app's chrome, ported from the Flutter source:
//   BottomNav   lib/screens/main_screen_wapper/main_screen_wrapper.dart
//   HomeHeader  lib/screens/dashboard/dashboard_screen.dart (header row, myChatButton, myProfileButton)
//               + lib/screens/dashboard/widgets/routine_mode_toggle.dart (RoutineModeChip)
//   TaskRow     lib/screens/dashboard/widgets/task_list_widget.dart
//   Screen      a pushed MaterialPageRoute on iOS (CupertinoPageTransition) with the
//               profile screen's floating back button (lib/screens/profile/profile_screen.dart)

/**
 * Open pushed screens report in here so the page under them can slide a third
 * to the left (the Cupertino parallax) and come back when they close.
 */
export const CoverContext = createContext<(delta: number) => void>(() => {});

/** Width of the phone column on wide screens. */
export const COLUMN = 480;

/* ------------------------------------------------------------------ nav */

export interface NavTab<K extends string> {
  key: K;
  label: string;
  /** SVG under /public/creator-app-icons, drawn through a mask so it takes the tint like ColorFilter srcIn. */
  icon: string;
}

/**
 * BottomNavBarItem + LabelIcon. The IconButton (Material 2) gives its icon a
 * 32x32 box (48 min size minus 8 padding each side) and LabelIcon's FittedBox
 * scales the icon + gap + label column down to fit it. That's why the active
 * tab's icon and label look smaller than 15px / 8px in the app. Same here:
 * the column is laid out at its natural size and scaled by min(1, 32/w, 32/h).
 */
function NavItem({ label, icon, active, index, onClick }: { label: string; icon: string; active: boolean; index: number; onClick: () => void }) {
  const colRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => {
      const el = colRef.current;
      if (!el) return;
      setScale(Math.min(1, 32 / el.offsetWidth, 32 / el.offsetHeight));
    };
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
  }, [active, label]);
  // _getPaddingTopBasedOnIndex
  const padTop = [4, 2, 0, 2][index] ?? 4;
  const color = active ? "#fff" : C.kBox;
  return (
    <div style={{ flex: 1, display: "flex", justifyContent: "center", paddingTop: padTop }}>
      <button
        type="button"
        className="cp-navbtn"
        aria-current={active ? "page" : undefined}
        aria-label={label}
        onClick={onClick}
        style={{ width: 48, height: 48, padding: 8, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}
      >
        <span style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span
            ref={colRef}
            style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", transform: `scale(${scale})`, transformOrigin: "center", flexShrink: 0 }}
          >
            <span
              aria-hidden
              style={{
                width: 15,
                height: 15,
                background: color,
                WebkitMask: `url(${icon}) center / contain no-repeat`,
                mask: `url(${icon}) center / contain no-repeat`,
              }}
            />
            <span style={{ height: 10 }} />
            {active && (
              <span style={{ fontSize: 8, fontWeight: 600, lineHeight: "12px", color, whiteSpace: "nowrap" }}>{label}</span>
            )}
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * The frosted bar: 75 + bottom inset tall, the visible bar starts 12px into
 * the box, kBlack at 0.8 over a sigma-20 blur, a 0.5px kWhite 0.08 hairline on
 * its top edge, and the icon row padded 20 from the top of the box.
 */
export function BottomNav<K extends string>({ tabs, current, onSelect, className }: { tabs: NavTab<K>[]; current: K; onSelect: (k: K) => void; className?: string }) {
  return (
    <nav aria-label="Portal sections" className={`cp-nav ${className ?? ""}`}>
      <div className="cp-nav-bar" />
      <div style={{ position: "absolute", left: 0, right: 0, top: 20, height: 55, display: "flex", alignItems: "center" }}>
        {tabs.map((t, i) => (
          <NavItem key={t.key} index={i} label={t.label} icon={t.icon} active={t.key === current} onClick={() => onSelect(t.key)} />
        ))}
      </div>
    </nav>
  );
}

/* --------------------------------------------------------------- header */

/** myChatButton / myProfileButton: 36x36 circle, kWhite 0.08, 10 left margin. */
export function CircleButton({ icon, size, label, onClick, href }: { icon: MIName; size: number; label: string; onClick?: () => void; href?: string }) {
  const style: CSSProperties = {
    width: 36,
    height: 36,
    marginLeft: 10,
    borderRadius: 18,
    background: "rgba(255,255,255,0.08)",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    cursor: "pointer",
    flexShrink: 0,
  };
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" aria-label={label} className="cp-btn" style={style}>
        <Icon name={icon} size={size} color="#fff" />
      </a>
    );
  return (
    <button type="button" aria-label={label} onClick={onClick} className="cp-btn" style={style}>
      <Icon name={icon} size={size} color="#fff" />
    </button>
  );
}

/**
 * RoutineModeChip's single static badge (the one the app shows on regrowth):
 * 30 tall, 14 side padding, fully rounded, 10px w600 letterSpacing 0.5.
 * Here in white like the chip's thumb instead of regrowth green.
 */
export function ModeChip({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        height: 30,
        padding: "0 14px",
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 15,
        background: "rgba(255,255,255,0.08)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.5,
        color: "#fff",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

/** Home header: 8 from the top, a 44-tall row with the chip left and the circle buttons right. */
export function HomeHeader({ chip, chatHref, onProfile }: { chip?: ReactNode; chatHref?: string | null; onProfile: () => void }) {
  return (
    <div className="cp-head-enter" style={{ paddingTop: 8 }}>
      <div style={{ height: 44, display: "flex", alignItems: "center" }}>
        {/* KESHAH logo in place of the app's mode chip (founder request). */}
        <img src="/images/keshah-wordmark-white.png" alt="KESHAH" width={61} height={19} style={{ display: "block", height: 19, width: "auto" }} />
        {chip ? <span style={{ marginLeft: 10 }}><ModeChip>{chip}</ModeChip></span> : null}
        <div style={{ flex: 1 }} />
        {chatHref && <CircleButton icon="chat" size={18} label="Open Slack" href={chatHref} />}
        <CircleButton icon="person" size={20} label="Profile" onClick={onProfile} />
      </div>
    </div>
  );
}

/** Home streak chip: color359033 1.5px outline, radius 20, padding 4/10, 12px w400 white. */
export function StreakChip({ days }: { days: number }) {
  return (
    <span
      style={{
        display: "inline-block",
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
      {days} day streak
    </span>
  );
}

/* ------------------------------------------------------------- task row */

/** The 70x70 thumbnail tile from _buildLearningTask: kWhite 0.1, radius 10, a 28px icon. */
export function TaskThumb({ icon }: { icon: MIName }) {
  return (
    <span style={{ width: 70, height: 70, borderRadius: 10, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={28} color="#fff" />
    </span>
  );
}

/**
 * TaskListWidget. Still to do: kBoxColor 0.9, radius 10. Done: kWhite 0.06,
 * radius 16, thumbnail at 0.4, title at 0.5, the time line at 0.3, and a
 * "Session complete" style line with a 14px green check that pops in
 * (elasticOut) when the task is finished while you watch. The next task
 * pulses (PulsePainter). Locked tasks get the grey overlay and lock icon.
 */
export function TaskRow({
  thumb,
  title,
  target,
  meta,
  doneText,
  done,
  locked,
  pulse,
  justDone,
  enterIndex,
  onClick,
}: {
  thumb: ReactNode;
  title: string;
  /** The grey "Target: ..." line (color959595). */
  target?: ReactNode;
  /** The "N min" line (white, 0.3 when done). */
  meta?: ReactNode;
  /** Text next to the green check once done ("Session complete"). */
  doneText: ReactNode;
  done: boolean;
  locked?: boolean;
  pulse?: boolean;
  justDone?: boolean;
  /** Position in the dashboard entrance stagger. */
  enterIndex?: number;
  onClick?: () => void;
}) {
  const radius = done ? 16 : 10;
  return (
    <div className={enterIndex !== undefined ? "cp-enter" : undefined} style={{ paddingBottom: 20, ["--i" as string]: enterIndex ?? 0 }}>
      <div className={pulse && !done && !locked ? "cp-pulse-wrap" : undefined} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={locked ? undefined : onClick}
          disabled={locked}
          aria-disabled={locked}
          className="cp-ink cp-focus"
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            padding: 20,
            border: "none",
            borderRadius: radius,
            background: done ? C.card : C.box,
            color: "#fff",
            fontFamily: C.font,
            textAlign: "left",
            cursor: locked ? "default" : "pointer",
          }}
        >
          <span style={{ opacity: done ? 0.4 : 1, flexShrink: 0, width: 70, height: 70, borderRadius: 10, overflow: "hidden" }}>{thumb}</span>
          <span style={{ width: 14, flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 10, lineHeight: "15px" }}>
            <span style={{ fontWeight: 600, color: done ? "rgba(255,255,255,0.5)" : "#fff" }}>{title}</span>
            {target && <span style={{ fontWeight: 400, color: C.grey }}>{target}</span>}
            {meta && <span style={{ fontWeight: 400, color: done ? "rgba(255,255,255,0.3)" : "#fff" }}>{meta}</span>}
            {done && (
              <span className={justDone ? "cp-check" : undefined} style={{ display: "flex", alignItems: "center", paddingTop: 4, transformOrigin: "left center" }}>
                <CheckCircle size={14} />
                <span style={{ width: 5 }} />
                <span style={{ fontWeight: 500, color: C.faint }}>{doneText}</span>
              </span>
            )}
          </span>
        </button>
        {locked && !done && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 10,
              background: "rgba(158,158,158,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: 20,
            }}
          >
            <Icon name="lock" size={22} color="#fff" />
          </div>
        )}
      </div>
    </div>
  );
}

/** "Done" signal for a row: true only on the render where it flips from not done to done. */
export function useJustDone(done: boolean): boolean {
  const was = useRef(done);
  const [just, setJust] = useState(false);
  useEffect(() => {
    if (done && !was.current) setJust(true);
    was.current = done;
  }, [done]);
  return just;
}

/* ------------------------------------------------------- pushed screen */

/**
 * A pushed route. On iOS the app's MaterialPageRoute uses CupertinoPageTransition:
 * 500 ms, the new page slides in from the right (fastEaseInToSlowEaseOut) while
 * the page under it slides a third to the left (linearToEaseOut). The back
 * button floats top-left like the profile screen's (top 8, left 16, 44x44,
 * arrow_back_ios_new_rounded 20), and the title sits 48 below the top.
 */
export function Screen({
  title,
  onBack,
  closing,
  depth = 0,
  children,
}: {
  title: ReactNode;
  onBack: () => void;
  closing?: boolean;
  depth?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cover = useContext(CoverContext);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (closing) return;
    cover(1);
    return () => cover(-1);
  }, [closing, cover]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);
  const reduce = prefersReducedMotion();
  // Rendered into the shell's #cp-screens host, outside the page that slides
  // left underneath (a transformed ancestor would carry the fixed screen with it).
  const host = typeof document !== "undefined" ? document.getElementById("cp-screens") : null;
  const node = (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
      tabIndex={-1}
      className="cp-screen"
      style={{
        zIndex: 40 + depth,
        animation: reduce ? undefined : closing ? `cp-push-out 500ms ${EASE.fastEaseInToSlowEaseOut.replace("0.17, 0.67, 0.13, 1", "0.87, 0, 0.83, 0.33")} both` : `cp-push-in 500ms ${EASE.fastEaseInToSlowEaseOut} both`,
      }}
    >
      <div style={{ position: "sticky", top: 0, height: 0, zIndex: 2 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="cp-btn"
          style={{ position: "absolute", top: "calc(8px + env(safe-area-inset-top, 0px))", left: 16, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <Icon name="back" size={20} color="#fff" />
        </button>
      </div>
      <div className="cp-page" style={{ paddingTop: "calc(48px + env(safe-area-inset-top, 0px))" }}>
        <Title>{title}</Title>
        {children}
      </div>
    </div>
  );
  return host ? createPortal(node, host) : node;
}

/** Layout CSS for the shell: column, nav, pushed screens. */
export const SHELL_CSS = `
.cp-col { max-width: ${COLUMN}px; margin: 0 auto; position: relative; min-height: 100dvh; background: #000; }
.cp-page { padding-left: max(${C.pad}px, env(safe-area-inset-left, 0px)); padding-right: max(${C.pad}px, env(safe-area-inset-right, 0px)); padding-bottom: calc(95px + env(safe-area-inset-bottom, 0px)); }
.cp-base { transition: transform 500ms ${EASE.linearToEaseOut}; }
.cp-base.cp-covered { transform: translateX(-33.333%); }
.cp-nav { position: fixed; left: 0; right: 0; bottom: 0; margin: 0 auto; max-width: ${COLUMN}px; height: calc(75px + env(safe-area-inset-bottom, 0px)); z-index: 20; transition: transform 500ms ${EASE.linearToEaseOut}; }
.cp-nav.cp-covered { transform: translateX(-33.333%); }
.cp-nav-bar { position: absolute; left: 0; right: 0; top: 12px; bottom: 0; background: rgba(0,0,0,0.8); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); border-top: 0.5px solid rgba(255,255,255,0.08); }
.cp-navbtn::after { content: ""; position: absolute; left: 4px; top: 4px; width: 40px; height: 40px; border-radius: 20px; background: rgba(255,255,255,0.16); opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
.cp-navbtn:active::after { opacity: 1; transition: none; }
.cp-navbtn:focus-visible { outline: 2px solid #fff; outline-offset: -4px; border-radius: 24px; }
.cp-screen { position: fixed; top: 0; bottom: 0; left: 0; right: 0; margin: 0 auto; max-width: ${COLUMN}px; background: #000; overflow-y: auto; overscroll-behavior: contain; outline: none; box-shadow: -8px 0 24px rgba(0,0,0,0.35); }
@keyframes cp-push-out { to { transform: translateX(100%) } }
@media (prefers-reduced-motion: reduce) {
  .cp-base, .cp-nav { transition: none; }
  .cp-base.cp-covered, .cp-nav.cp-covered { transform: none; }
}
@media (min-width: ${COLUMN + 1}px) {
  body { background: #000; }
  .cp-col { border-left: 1px solid rgba(255,255,255,0.06); border-right: 1px solid rgba(255,255,255,0.06); }
  /* The parallax would slide the page out of the column; the pushed screen just covers it. */
  .cp-base.cp-covered, .cp-nav.cp-covered { transform: none; }
}
`;

/**
 * Open/close state for one pushed screen, keeping it mounted through the
 * 500 ms slide-out so the back transition plays like the app's.
 */
export function usePushed<T>() {
  const [value, setValue] = useState<T | null>(null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const open = (v: T) => {
    if (timer.current) clearTimeout(timer.current);
    setClosing(false);
    setValue(v);
  };
  const close = () => {
    if (value === null) return;
    if (prefersReducedMotion()) {
      setValue(null);
      return;
    }
    setClosing(true);
    timer.current = setTimeout(() => {
      setValue(null);
      setClosing(false);
    }, 500);
  };
  return { value, closing, open, close, isOpen: value !== null && !closing };
}
