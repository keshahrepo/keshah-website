/**
 * One follow-up per stage for outreach creators, sent as a reply in our
 * original Gmail thread from "Aadi from KESHAH" (Firestore + Gmail side in
 * outreach-db.ts sendOutreachNudges). Pure rules and copy here; tests in
 * outreach-nudges.test.ts.
 *
 *   noreply   status "emailed" 48h+ after our email: the $1,000 option, one last time
 *   calendar  status "invited" 48h+ after the founder sent the Calendly link
 *
 * The 48 hours count weekends; sends go out on weekday mornings (US Eastern),
 * at most NUDGE_RUN_LIMIT per cron run and NUDGE_DAILY_CAP a day, and only
 * while Settings/outreach_nudges.enabled is true.
 *
 * Fields on careers_applications:
 *   nudge_noreply_sent_at    ISO, when the noreply nudge went out
 *   nudge_calendar_sent_at   ISO, when the calendar nudge went out
 *   nudge_skipped            { noreply?: reason, calendar?: reason }: not sent (they or you wrote since)
 */

export type NudgeKind = "noreply" | "calendar";

export const NUDGE_AFTER_MS = 48 * 3_600_000;
export const NUDGE_RUN_LIMIT = 8;
export const NUDGE_DAILY_CAP = 60;
/** Weekday send window, US Eastern: 9:00 to 11:59. */
export const NUDGE_FROM_HOUR = 9;
export const NUDGE_TO_HOUR = 12;
export const INTERVIEW_URL = "https://calendly.com/aadi-keshah/creator-interview";

const ms = (v: unknown): number => {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? t : NaN;
};

/** Which nudge (if any) is due for this application now. */
export function nudgeDue(app: Record<string, unknown>, now = Date.now()): NudgeKind | null {
  const skipped = (app.nudge_skipped ?? {}) as Record<string, unknown>;
  if (app.status === "emailed" && !app.nudge_noreply_sent_at && !skipped.noreply && ms(app.emailed_at) + NUDGE_AFTER_MS <= now) return "noreply";
  if (app.status === "invited" && !app.nudge_calendar_sent_at && !skipped.calendar && ms(app.calendar_sent_at) + NUDGE_AFTER_MS <= now) return "calendar";
  return null;
}

/** US Eastern weekday and hour. */
export function easternNow(now = new Date()): { weekday: number; hour: number; date: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { weekday, hour: Number(parts.hour), date: `${parts.year}-${parts.month}-${parts.day}` };
}

/** Weekday morning in US Eastern time. */
export function inSendWindow(now = new Date()): boolean {
  const { weekday, hour } = easternNow(now);
  return weekday >= 1 && weekday <= 5 && hour >= NUDGE_FROM_HOUR && hour < NUDGE_TO_HOUR;
}

/** "Hey Abbie," from the stored greeting, else their first name. */
export function greeting(app: Record<string, unknown>): string {
  const g = String(app.outreach_greet ?? "").trim();
  if (g) return g;
  const first = String(app.full_name ?? "").trim().split(/\s+/)[0];
  return first ? `Hey ${first},` : "Hey,";
}

export function noReplyNudge(greet: string): string {
  return [
    greet,
    "",
    "Quick update since my last email: we've just added a $1,000/month option for select creators. I wanted to share it with you and reach out one last time because I really think your vibe fits KESHAH.",
    "",
    "If you're interested, you can grab a 15-minute call here:",
    INTERVIEW_URL,
    "",
    "Aadi",
  ].join("\n");
}

export function calendarNudge(greet: string): string {
  return [greet, "", "Just checking you saw this. You can pick any time that works here:", INTERVIEW_URL, "", "Aadi"].join("\n");
}

/** "Re: <subject>" (no double Re:). */
export function replySubject(subject: string): string {
  const s = subject.trim();
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}
