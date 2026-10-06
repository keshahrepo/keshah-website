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
import { Button, C, Card, P, api } from "./_components/ui";

const TABS = [
  ["today", "Today"],
  ["month", "This month"],
  ["bonus", "Bonuses"],
  ["off", "Days off"],
  ["invoices", "Invoices"],
  ["contract", "Contract"],
] as const;
type Tab = (typeof TABS)[number][0];

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
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.font }}>
      <style>{`
        .cp-wrap { max-width: 600px; margin: 0 auto; padding: 20px 16px 64px; }
        .cp-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 18px; }
        @media (min-width: 640px) {
          .cp-wrap { padding: 48px 24px 80px; }
          .cp-tabs { display: flex; }
          .cp-tabs > button { flex: 1 1 auto; }
        }
      `}</style>
      <div className="cp-wrap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>KESHAH</div>
            <div style={{ fontSize: 13, color: C.faint }}>{data ? data.creator.name : "Creator portal"}</div>
          </div>
          <button
            onClick={signOut}
            style={{
              background: "none",
              border: C.border,
              borderRadius: 999,
              color: C.dim,
              fontFamily: C.font,
              fontSize: 13,
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
            <P style={{ textAlign: "center", padding: "40px 0" }}>Loading your portal...</P>
          )
        ) : !inPortal ? (
          <GettingStarted data={data} onDone={load} />
        ) : (
          <>
            <nav className="cp-tabs" aria-label="Portal sections">
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  aria-current={tab === k ? "page" : undefined}
                  onClick={() => {
                    setTab(k);
                    if (k === "month" || k === "today") load();
                  }}
                  style={{
                    minHeight: 44,
                    padding: "0 12px",
                    borderRadius: 999,
                    border: tab === k ? "1px solid #fff" : C.border,
                    background: tab === k ? "#fff" : "transparent",
                    color: tab === k ? "#000" : "#fff",
                    fontFamily: C.font,
                    fontSize: 13,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
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
