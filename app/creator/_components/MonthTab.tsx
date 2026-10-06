"use client";

import { useEffect, useState } from "react";
import { fmtDateShort, fmtMoney, fmtMonthLong } from "@/lib/creators/time";
import type { MonthData } from "./types";
import { C, Card, Eyebrow, H, P, Pill, Row, api, statusColor } from "./ui";

/** "12.4K" style view counts for the day list. */
function shortViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ flex: "1 1 45%", minWidth: 130 }}>
      <Eyebrow style={{ marginBottom: 4 }}>{label}</Eyebrow>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.faint }}>{sub}</div>}
    </div>
  );
}

const stateLabel: Record<string, string> = {
  posted: "Posted",
  off: "Day off",
  off_requested: "Day off requested",
  missed: "Missed",
  pending: "Coming up",
};

export default function MonthTab({ m }: { m: MonthData }) {
  const missed = m.days.filter((d) => d.state === "missed");
  const pastOrToday = m.days.filter((d) => d.date <= m.today).reverse();
  const nl = m.nextLevel;
  // Views per day from the automatic post sync (TikTok + Instagram together).
  const [dayViews, setDayViews] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!m.started || m.today < `${m.month}-01`) return;
    const last = m.days.length ? m.days[m.days.length - 1].date : m.today;
    const to = m.today < last ? m.today : last;
    api<{ days: { date: string; views: number }[] }>(`/api/creator/posts?from=${m.month}-01&to=${to}`)
      .then((r) => setDayViews(new Map(r.days.map((d) => [d.date, d.views]))))
      .catch(() => setDayViews(new Map()));
  }, [m.started, m.month, m.today, m.days]);
  if (!m.started) {
    return (
      <div>
        <Card>
          <Eyebrow>{fmtMonthLong(m.month)}</Eyebrow>
          <H>Your pay starts on your first posting day.</H>
          <P style={{ marginBottom: 0 }}>
            The first day you log videos on the Today tab becomes your start date. Your days, level and earnings show up here from then on.
          </P>
        </Card>
      </div>
    );
  }
  return (
    <div>
      <Card>
        <Eyebrow>{fmtMonthLong(m.month)}</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <Stat
            label="Days posted"
            value={`${m.postedDays}/${m.expectedWeekdays}`}
            sub={m.approvedOffDays ? `+ ${m.approvedOffDays} approved day${m.approvedOffDays === 1 ? "" : "s"} off` : undefined}
          />
          <Stat label="Earned so far" value={fmtMoney(m.totalCents)} sub="base + bonuses this month" />
          <Stat label="Missed" value={String(m.missedDays)} />
          <Stat label="Still to go" value={String(m.pendingDays)} sub="weekdays left" />
        </div>
      </Card>

      <Card>
        <Eyebrow>Your level</Eyebrow>
        <Row>
          <div style={{ fontSize: 15 }}>Monthly base</div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{fmtMoney(m.levelBaseCents)}</div>
        </Row>
        <Row style={{ marginTop: 8 }}>
          <div style={{ fontSize: 15 }}>Base earned so far</div>
          <div style={{ fontSize: 15 }}>{fmtMoney(m.baseDueCents)}</div>
        </Row>
        <div style={{ borderTop: C.border, margin: "12px 0" }} />
        {nl.nextBaseCents ? (
          <P style={{ marginBottom: 0 }}>
            You move up to {fmtMoney(nl.nextBaseCents)} a month from <b style={{ color: "#fff" }}>{fmtMonthLong(nl.earliestMonth!)}</b>. Missed
            days don&apos;t push that back, but each one comes off that month&apos;s pay.
          </P>
        ) : (
          <P style={{ marginBottom: 0 }}>You&apos;re at the top level.</P>
        )}
      </Card>

      <Card>
        <Eyebrow>Trial</Eyebrow>
        {m.trial.isInTrial ? (
          <P style={{ marginBottom: 0 }}>
            You&apos;ve posted {m.trial.postedDays} of your first 10 days. Keep going.
          </P>
        ) : (
          <P style={{ marginBottom: 0 }}>Trial done. Your first 10 posting days were finished on {fmtDateShort(m.trial.trialEndsAfterDate!)}.</P>
        )}
      </Card>

      <Card>
        <Eyebrow>Bonuses this month</Eyebrow>
        {m.bonusLines.length === 0 ? (
          <P style={{ marginBottom: 0 }}>No approved bonuses yet this month.</P>
        ) : (
          m.bonusLines.map((l, i) => (
            <Row key={i} style={{ padding: "6px 0", alignItems: "flex-start" }}>
              <div style={{ fontSize: 13, color: C.dim, wordBreak: "break-word" }}>{l.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMoney(l.amount_cents)}</div>
            </Row>
          ))
        )}
        {m.adjustmentLines.map((l, i) => (
          <Row key={`a${i}`} style={{ padding: "6px 0" }}>
            <div style={{ fontSize: 13, color: C.dim }}>{l.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMoney(l.amount_cents)}</div>
          </Row>
        ))}
      </Card>

      {missed.length > 0 && (
        <Card>
          <Eyebrow>Missed days</Eyebrow>
          <P style={{ marginBottom: 6 }}>{missed.map((d) => fmtDateShort(d.date)).join(", ")}</P>
          <P style={{ fontSize: 12, color: C.faint, marginBottom: 0 }}>
            A day counts when all {5} videos are logged with both a TikTok and an Instagram link.
          </P>
        </Card>
      )}

      <Card>
        <Eyebrow>Day by day</Eyebrow>
        {pastOrToday.length === 0 && <P style={{ marginBottom: 0 }}>Nothing yet this month.</P>}
        {pastOrToday.map((d) => (
          <Row key={d.date} style={{ padding: "10px 0", borderTop: C.border }}>
            <div style={{ fontSize: 14 }}>{fmtDateShort(d.date)}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {!!dayViews.get(d.date) && <span style={{ fontSize: 12, color: C.faint }}>{shortViews(dayViews.get(d.date)!)} views</span>}
              <span style={{ fontSize: 12, color: C.faint }}>{d.videos}/5</span>
              <Pill color={statusColor[d.state]}>{d.date === m.today && d.state === "pending" ? "Today" : stateLabel[d.state]}</Pill>
            </div>
          </Row>
        ))}
      </Card>
    </div>
  );
}
