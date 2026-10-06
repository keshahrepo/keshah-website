"use client";

import { useCallback, useEffect, useState } from "react";
import BonusTab from "./_components/BonusTab";
import ContractTab from "./_components/ContractTab";
import DaysOffTab from "./_components/DaysOffTab";
import GettingStarted from "./_components/GettingStarted";
import InvoicesTab from "./_components/InvoicesTab";
import MonthTab from "./_components/MonthTab";
import TodayTab from "./_components/TodayTab";
import type { PortalData } from "./_components/types";
import { Button, C, Card, P, PORTAL_CSS, Skel, SkelCard, api, prefersReducedMotion } from "./_components/ui";

const TABS = [
  ["today", "Today"],
  ["month", "This month"],
  ["bonus", "Bonuses"],
  ["off", "Days off"],
  ["invoices", "Invoices"],
  ["contract", "Contract"],
] as const;
type Tab = (typeof TABS)[number][0];

// Line icons for the tab bar (24px grid, drawn with currentColor).
const ICONS: Record<Tab, string> = {
  today: "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  month: "M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 10h16M8 3v4M16 3v4",
  bonus: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  off: "M12 21V11M5 11a7 7 0 0 1 14 0zM3 21h18",
  invoices: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  contract: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
};

function TabIcon({ tab }: { tab: Tab }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[tab]} />
    </svg>
  );
}

export default function CreatorPortal() {
  const [data, setData] = useState<PortalData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");

  const load = useCallback(() => {
    api<PortalData>("/api/creator/portal").then(
      (d) => {
        setData(d);
        setErr(null);
      },
      (e) => setErr(e.message),
    );
  }, []);
  useEffect(load, [load]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/creator/login";
  }

  // Getting started gates everything until onboarding.completed_at is stored.
  const inPortal = !!data?.onboarding.completed_at;

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.text, fontFamily: C.font }}>
      <style>{PORTAL_CSS}</style>
      <style>{`
        .cp-wrap { max-width: 600px; margin: 0 auto; padding: calc(16px + env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) 64px max(16px, env(safe-area-inset-left, 0px)); }
        .cp-wrap.has-nav { padding-bottom: calc(110px + env(safe-area-inset-bottom, 0px)); }
        /* Phone: frosted bottom bar like the app's nav. */
        .cp-tabs {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
          display: grid; grid-template-columns: repeat(6, 1fr);
          padding: 10px 6px calc(10px + env(safe-area-inset-bottom, 0px));
          background: rgba(0,0,0,0.6); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255,255,255,0.08); border-radius: 22px 22px 0 0;
        }
        .cp-tab {
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
          min-height: 52px; padding: 4px 2px; border: none; border-radius: 14px; background: none;
          color: rgba(255,255,255,0.4); font-family: inherit; font-size: 10px; font-weight: 500; line-height: 1.1;
          cursor: pointer; text-align: center;
        }
        .cp-tab[aria-current="page"] { color: #fff; font-weight: 600; }
        .cp-tab:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
        @media (min-width: 640px) {
          .cp-wrap { max-width: 680px; padding: calc(40px + env(safe-area-inset-top, 0px)) 24px 80px; }
          .cp-wrap.has-nav { padding-bottom: 80px; }
          .cp-tabs {
            position: sticky; top: calc(12px + env(safe-area-inset-top, 0px)); bottom: auto; margin-bottom: 22px;
            display: flex; gap: 4px; padding: 5px;
            background: rgba(20,20,20,0.75); border: 1px solid rgba(255,255,255,0.1); border-radius: 999px;
          }
          .cp-tab { flex: 1 1 auto; flex-direction: row; gap: 6px; min-height: 42px; border-radius: 999px; font-size: 13px; padding: 0 10px; white-space: nowrap; }
          .cp-tab[aria-current="page"] { background: #fff; color: #000; }
          .cp-tab:not([aria-current="page"]):hover { color: #fff; background: rgba(255,255,255,0.06); }
        }
      `}</style>
      <div className={inPortal ? "cp-wrap has-nav" : "cp-wrap"}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <img src="/images/keshah-wordmark-white.png" alt="KESHAH" width={64} height={20} style={{ display: "block", marginBottom: 6, height: 20, width: "auto" }} />
            <div style={{ fontSize: 13, color: C.faint }}>{data ? data.creator.name : "Creator portal"}</div>
          </div>
          <button
            onClick={signOut}
            className="cp-btn"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "none",
              borderRadius: 999,
              color: "#fff",
              fontFamily: C.font,
              fontSize: 13,
              fontWeight: 500,
              padding: "0 16px",
              minHeight: 40,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>

        {!data ? (
          err ? (
            <Card>
              <P>{err}</P>
              <Button variant="ghost" onClick={load}>
                Try again
              </Button>
            </Card>
          ) : (
            // Same rough shape as the first screen so nothing jumps when data lands.
            <div>
              <Skel h={10} w={110} style={{ marginBottom: 14 }} />
              <Skel h={30} w="70%" style={{ marginBottom: 14 }} />
              <SkelCard lines={3} height={190} />
              <SkelCard lines={2} height={150} />
              <SkelCard lines={2} height={150} />
            </div>
          )
        ) : !inPortal ? (
          <GettingStarted data={data} onDone={load} />
        ) : (
          <>
            <nav className="cp-tabs" aria-label="Portal sections">
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  className="cp-tab"
                  aria-current={tab === k ? "page" : undefined}
                  onClick={() => {
                    setTab(k);
                    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
                    if (k === "month" || k === "today") load();
                  }}
                >
                  <TabIcon tab={k} />
                  {label}
                </button>
              ))}
            </nav>
            {tab === "today" && <TodayTab key={data.today.date} data={data} onSaved={load} />}
            {tab === "month" && <MonthTab m={data.month} />}
            {tab === "bonus" && <BonusTab today={data.today.date} />}
            {tab === "off" && <DaysOffTab today={data.today.date} />}
            {tab === "invoices" && <InvoicesTab />}
            {tab === "contract" && <ContractTab />}
          </>
        )}
      </div>
    </div>
  );
}
