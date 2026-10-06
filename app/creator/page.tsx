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
import { C, P, api } from "./_components/ui";

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
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 16px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>KESHAH</div>
            <div style={{ fontSize: 12, color: C.faint }}>{data ? data.creator.name : "Creator portal"}</div>
          </div>
          <button
            onClick={signOut}
            style={{ background: "none", border: "none", color: C.faint, fontFamily: C.font, fontSize: 12, cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>

        {!data ? (
          <P>{err ?? "Loading..."}</P>
        ) : !inPortal ? (
          <GettingStarted data={data} onDone={load} />
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: 6,
                overflowX: "auto",
                marginBottom: 16,
                paddingBottom: 4,
                scrollbarWidth: "none",
              }}
            >
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => {
                    setTab(k);
                    if (k === "month" || k === "today") load();
                  }}
                  style={{
                    flexShrink: 0,
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: tab === k ? "1px solid #fff" : C.border,
                    background: tab === k ? "#fff" : "transparent",
                    color: tab === k ? "#000" : "#fff",
                    fontFamily: C.font,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
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
