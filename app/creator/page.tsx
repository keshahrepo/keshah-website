"use client";

import { useCallback, useEffect, useState } from "react";
import BonusTab from "./_components/BonusTab";
import GettingStarted from "./_components/GettingStarted";
import MonthTab from "./_components/MonthTab";
import ProfileScreen from "./_components/ProfileScreen";
import TodayTab from "./_components/TodayTab";
import { BottomNav, CoverContext, SHELL_CSS, usePushed, type NavTab } from "./_components/AppShell";
import type { PortalData } from "./_components/types";
import { Button, C, Card, P, PORTAL_CSS, Skel, SkelCard, api, prefersReducedMotion } from "./_components/ui";

// Same shape as the app's nav: Progress | Home (centre) | a third tab, with
// Profile behind the round button in the Home header (dashboard_screen.dart
// myProfileButton). Days off, Invoices and Contract live in Profile.
type Tab = "month" | "today" | "bonus";
const TABS: NavTab<Tab>[] = [
  { key: "month", label: "Month", icon: "/creator-app-icons/progress.svg" },
  { key: "today", label: "Today", icon: "/creator-app-icons/home.svg" },
  { key: "bonus", label: "Bonuses", icon: "/creator-app-icons/star.svg" },
];

export default function CreatorPortal() {
  const [data, setData] = useState<PortalData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const profile = usePushed<true>();
  const [covered, setCovered] = useState(0);
  const cover = useCallback((d: number) => setCovered((n) => Math.max(0, n + d)), []);

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
  const coveredCls = covered > 0 ? " cp-covered" : "";

  return (
    <CoverContext.Provider value={cover}>
      <div className="cp-root" style={{ minHeight: "100dvh", background: C.bg, color: C.text, fontFamily: C.font }}>
        <style>{PORTAL_CSS}</style>
        <style>{SHELL_CSS}</style>
        <div className="cp-col">
          <div className={`cp-base${coveredCls}`}>
            <div className="cp-page" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
              {!data ? (
                err ? (
                  <div style={{ paddingTop: 72 }}>
                    <Card>
                      <P>{err}</P>
                      <Button variant="ghost" onClick={load}>
                        Try again
                      </Button>
                    </Card>
                  </div>
                ) : (
                  // Same rough shape as the first screen so nothing jumps when data lands.
                  <div style={{ paddingTop: 8 }}>
                    <div style={{ height: 44, display: "flex", alignItems: "center", gap: 10 }}>
                      <Skel h={30} w={120} r={15} />
                      <div style={{ flex: 1 }} />
                      <Skel h={36} w={36} r={18} />
                    </div>
                    <Skel h={11} w={130} style={{ margin: "44px 0 20px" }} />
                    <SkelCard lines={2} height={110} />
                    <SkelCard lines={2} height={110} />
                    <SkelCard lines={2} height={110} />
                  </div>
                )
              ) : !inPortal ? (
                <GettingStarted data={data} onDone={load} onProfile={() => profile.open(true)} />
              ) : (
                <>
                  {tab === "today" && <TodayTab key={data.today.date} data={data} onSaved={load} onProfile={() => profile.open(true)} />}
                  {tab === "month" && <MonthTab m={data.month} />}
                  {tab === "bonus" && <BonusTab today={data.today.date} />}
                </>
              )}
            </div>
          </div>
          {data && inPortal && (
            <BottomNav
              tabs={TABS}
              current={tab}
              className={coveredCls}
              onSelect={(k) => {
                setTab(k);
                if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
                if (k === "month" || k === "today") load();
              }}
            />
          )}
          <div id="cp-screens" />
          {profile.value && data && (
            <ProfileScreen data={data} inPortal={inPortal} closing={profile.closing} onBack={profile.close} onSignOut={signOut} />
          )}
        </div>
      </div>
    </CoverContext.Provider>
  );
}
