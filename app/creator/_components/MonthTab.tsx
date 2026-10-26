"use client";

import { useEffect, useState } from "react";
import { fmtDateShort, fmtMoney, fmtMonthLong } from "@/lib/creators/time";
import type { MonthData } from "./types";
import { C, Card, CheckCircle, Eyebrow, Group, H, P, Pill, ProfileRow, Separator, StatCard, Title, api, statusColor } from "./ui";

/** "12.4K" style view counts for the day list. */
function shortViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The Progress tab's calendar (lib/widget/calendar/widgets/calender_view.dart,
 * table_calendar 3.1.3 defaults): #141414 card, radius 14, padding 15/20,
 * centred 17px month title, 16-tall weekday row (#4F4F4F weekdays, #6A6A6A
 * weekends), 52-tall rows, 14px day numbers. Done days are Colors.green,
 * missed days (and today until it's done) Colors.red, today gets a 1px white
 * ring, and days outside the range are the disabled #BFBFBF.
 */
function MonthCalendar({ m }: { m: MonthData }) {
  const [y, mo] = m.month.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const byDate = new Map(m.days.map((d) => [d.date, d.state]));
  const firstDay = m.days.length ? m.days[0].date : `${m.month}-01`;
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const color = (date: string): string | undefined => {
    if (date > m.today || date < firstDay) return "#BFBFBF";
    const st = byDate.get(date);
    if (st === "posted" || st === "off") return "#4CAF50";
    if (st === "missed") return "#F44336";
    if (date === m.today) return "#F44336";
    return undefined;
  };
  return (
    <div style={{ background: C.group, borderRadius: 14, padding: "15px 20px" }}>
      <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{fmtMonthLong(m.month)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", height: 16, alignItems: "center", fontSize: 14, lineHeight: "16px", textAlign: "center" }}>
        {DOW.map((d, i) => (
          <div key={d} style={{ color: i === 0 || i === 6 ? "#6A6A6A" : "#4F4F4F" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {cells.map((n, i) => {
          if (n === null) return <div key={i} style={{ height: 52 }} />;
          const date = `${m.month}-${String(n).padStart(2, "0")}`;
          const today = date === m.today;
          return (
            <div key={i} style={{ height: 52, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  flexShrink: 0,
                  borderRadius: "50%",
                  border: today ? "1px solid #fff" : "1px solid transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  color: color(date) ?? "#fff",
                }}
              >
                {n}
              </div>
            </div>
          );
        })}
      </div>
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
      <div style={{ paddingTop: 24 }}>
        <Title>This month</Title>
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
  // Same layout as the app's Progress tab (progress_tracker_screen.dart): title,
  // a row of stat cards, ACTIVITY with the calendar, a separator, then sections.
  return (
    <div style={{ paddingTop: 24 }}>
      <div className="cp-fade-in" style={{ ["--i" as string]: 0 }}>
        <Title>This month</Title>
      </div>
      <div className="cp-fade-in" style={{ ["--i" as string]: 1, display: "flex", gap: 12 }}>
        <StatCard label="Posted" value={`${m.postedDays}/${m.expectedWeekdays}`} color={m.postedDays > 0 ? C.green : undefined} />
        <StatCard label="Missed" value={String(m.missedDays)} />
        <StatCard label="To go" value={String(m.pendingDays)} />
      </div>
      {m.approvedOffDays > 0 && (
        <div style={{ fontSize: 12, color: C.faint, marginTop: 10 }}>
          Plus {m.approvedOffDays} approved day{m.approvedOffDays === 1 ? "" : "s"} off.
        </div>
      )}

      <div className="cp-fade-in" style={{ ["--i" as string]: 2, marginTop: 32 }}>
        <Eyebrow style={{ marginBottom: 16 }}>Activity</Eyebrow>
        <MonthCalendar m={m} />
      </div>

      <Separator />

      <Eyebrow>Earnings</Eyebrow>
      <Group>
        <ProfileRow label="Earned so far" subtitle="Base and bonuses this month" trailing={<b style={{ color: "#fff", fontWeight: 600 }}>{fmtMoney(m.totalCents)}</b>} chevron={false} />
        <ProfileRow label="Monthly base" trailing={fmtMoney(m.levelBaseCents)} chevron={false} />
        <ProfileRow label="Base earned so far" trailing={fmtMoney(m.baseDueCents)} chevron={false} isLast />
      </Group>
      <div style={{ fontSize: 13, color: C.faint, marginTop: 12 }}>
        {nl.nextBaseCents ? (
          <>
            You move up to {fmtMoney(nl.nextBaseCents)} a month from <b style={{ color: "#fff", fontWeight: 500 }}>{fmtMonthLong(nl.earliestMonth!)}</b>. Missed
            days don&apos;t push that back, but each one comes off that month&apos;s pay.
          </>
        ) : (
          "You're at the top level."
        )}
      </div>

      <Eyebrow style={{ marginTop: 32 }}>Trial</Eyebrow>
      <Group style={{ padding: "16px 20px", fontSize: 14 }}>
        {m.trial.isInTrial
          ? `You've posted ${m.trial.postedDays} of your ${m.trial.requiredDays ?? 10} trial days. Keep going.`
          : `Trial done. Your ${m.trial.requiredDays ?? 10} trial days were finished on ${fmtDateShort(m.trial.trialEndsAfterDate!)}.`}
      </Group>

      <Eyebrow style={{ marginTop: 32 }}>Bonuses this month</Eyebrow>
      <Group>
        {m.bonusLines.length === 0 && m.adjustmentLines.length === 0 && (
          <ProfileRow label="No approved bonuses yet this month." chevron={false} isLast />
        )}
        {[...m.bonusLines, ...m.adjustmentLines].map((l, i, all) => (
          <ProfileRow key={i} label={<span style={{ wordBreak: "break-word" }}>{l.label}</span>} trailing={fmtMoney(l.amount_cents)} chevron={false} isLast={i === all.length - 1} />
        ))}
      </Group>

      {missed.length > 0 && (
        <>
          <Eyebrow style={{ marginTop: 32 }}>Missed days</Eyebrow>
          <Group style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 14 }}>{missed.map((d) => fmtDateShort(d.date)).join(", ")}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
              A day counts when all {5} videos are logged with both a TikTok and an Instagram link.
            </div>
          </Group>
        </>
      )}

      <Eyebrow style={{ marginTop: 32 }}>Day by day</Eyebrow>
      <Group>
        {pastOrToday.length === 0 && <ProfileRow label="Nothing yet this month." chevron={false} isLast />}
        {pastOrToday.map((d, i) => (
          <ProfileRow
            key={d.date}
            label={
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {(d.state === "posted" || d.state === "off") && <CheckCircle size={14} />}
                {fmtDateShort(d.date)}
              </span>
            }
            subtitle={[`${d.videos}/5 videos`, dayViews.get(d.date) ? `${shortViews(dayViews.get(d.date)!)} views` : ""].filter(Boolean).join(" · ")}
            trailing={<Pill color={statusColor[d.state]}>{d.date === m.today && d.state === "pending" ? "Today" : stateLabel[d.state]}</Pill>}
            chevron={false}
            isLast={i === pastOrToday.length - 1}
          />
        ))}
      </Group>
    </div>
  );
}
