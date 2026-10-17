/**
 * The 72-hour contract deadline for newly accepted creators. Pure helpers, no
 * Firestore (lib/creators/offer.ts applies them).
 *
 * Fields on ContentCreators/{id}:
 *   contract_deadline_at          ISO instant: 11:59 PM America/New_York on the 3rd day after
 *                                 acceptance. Set once at accept time, new offers only.
 *   contract_reminder_sent_at     ISO, when the "offer is waiting" push + email went out (cleared on extend).
 *   contract_deadline_extended_at ISO, the last "Give 48 more hours".
 *   withdrawn_at                  ISO, when the founder withdrew the offer.
 *
 * Nothing here ever withdraws an offer on its own: a missed deadline only
 * shows up on the founder's Home ("deadline" need).
 */
import { CREATOR_SIGNOFF, lightEmailHtml } from "./invite";

export const DEADLINE_TZ = "America/New_York";
/** Days after the acceptance date (in ET) the deadline falls on. */
export const DEADLINE_DAYS = 3;
/** The reminder opens at 6 PM ET the day before an 11:59 PM deadline, so "tomorrow" stays true. */
export const REMINDER_LEAD_MS = 30 * 3_600_000;
export const EXTEND_MS = 48 * 3_600_000;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- time

function partsIn(at: Date, tz: string): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour"), min: g("minute"), s: g("second") };
}

/** yyyy-mm-dd of `at` in `tz`. */
export function dateIn(at: Date, tz: string = DEADLINE_TZ): string {
  const { y, m, d } = partsIn(at, tz);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The UTC instant of a wall-clock time in `tz` (DST-correct: the offset is read at that instant). */
export function zonedTime(ymd: string, h: number, min: number, s: number, tz: string = DEADLINE_TZ): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min, s);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = partsIn(new Date(guess), tz);
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    const diff = wall - seen;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** 11:59:59 PM ET on `ymd`. */
export function endOfDayEt(ymd: string): Date {
  return zonedTime(ymd, 23, 59, 59, DEADLINE_TZ);
}

/** The deadline for an offer accepted at `acceptedAt`: 11:59 PM ET on the 3rd day after (ET dates). */
export function contractDeadlineFor(acceptedAt: Date): string {
  return endOfDayEt(addDaysYmd(dateIn(acceptedAt), DEADLINE_DAYS)).toISOString();
}

/** "Tuesday, October 14 at 11:59 PM ET" */
export function deadlineLong(iso: string): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: DEADLINE_TZ, weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
  return `${day} at ${deadlineClock(iso)} ET`;
}

/** "Oct 14" */
export function deadlineShort(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: DEADLINE_TZ, month: "short", day: "numeric" }).format(new Date(iso));
}

/** "Tue, Oct 14" */
export function deadlineWeekdayShort(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: DEADLINE_TZ, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
}

/** "11:59 PM" */
function deadlineClock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: DEADLINE_TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

// ---------------------------------------------------------------- state

/** The slice of a ContentCreators doc these helpers read (raw Firestore data is fine). */
export interface OfferDoc {
  status?: unknown;
  email?: unknown;
  name?: unknown;
  legal_name?: unknown;
  keshah_email?: unknown;
  contract?: { status?: unknown } | null;
  contract_deadline_at?: unknown;
  contract_reminder_sent_at?: unknown;
  withdrawn_at?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const validIso = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);

export function deadlineOf(d: OfferDoc): string | null {
  return validIso(d.contract_deadline_at);
}

/**
 * A new offer waiting on the creator's signature: deadline set, contract sent
 * (an unsent one is on the founder), not withdrawn, still onboarding.
 */
export function offerOpen(d: OfferDoc): boolean {
  const status = str(d.status) || "onboarding";
  return !!deadlineOf(d) && str(d.contract?.status) === "sent" && !d.withdrawn_at && status === "onboarding";
}

/** Whole days past the deadline (calendar days in ET, at least 1 once it's passed), else 0. */
export function daysPastDue(deadlineIso: string, now: Date): number {
  const dl = Date.parse(deadlineIso);
  if (now.getTime() <= dl) return 0;
  const a = Date.parse(`${dateIn(new Date(dl))}T00:00:00Z`);
  const b = Date.parse(`${dateIn(now)}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / DAY_MS));
}

export function isPastDue(d: OfferDoc, now: Date): boolean {
  const dl = deadlineOf(d);
  return !!dl && offerOpen(d) && now.getTime() > Date.parse(dl);
}

/** Should the "offer is waiting" reminder go out now? Once per deadline, in the last 30 hours. */
export function reminderDue(d: OfferDoc, now: Date): boolean {
  const dl = deadlineOf(d);
  if (!dl || !offerOpen(d) || d.contract_reminder_sent_at) return false;
  const t = now.getTime();
  const end = Date.parse(dl);
  return t >= end - REMINDER_LEAD_MS && t < end;
}

/**
 * "Give 48 more hours": the deadline moves 48 hours. If that still leaves under
 * a day (the founder got to it late), it becomes 11:59 PM ET two days from now.
 */
export function extendedDeadline(currentIso: string, now: Date): string {
  const moved = Date.parse(currentIso) + EXTEND_MS;
  if (moved - now.getTime() >= DAY_MS) return new Date(moved).toISOString();
  return endOfDayEt(addDaysYmd(dateIn(now), 2)).toISOString();
}

// ---------------------------------------------------------------- copy

export function firstNameOf(d: OfferDoc): string {
  return (str(d.name) || str(d.legal_name)).trim().split(/\s+/)[0] ?? "";
}

export function reminderPush(deadlineIso: string, now: Date): { title: string; body: string; data: Record<string, string> } {
  // The window opens the evening before; if the cron only gets to it after midnight ET, "tomorrow" would be wrong.
  const sameDay = dateIn(now) === dateIn(new Date(deadlineIso));
  return {
    title: "Your KESHAH offer is waiting",
    body: sameDay
      ? "Sign your contract by 11:59 PM ET tonight to keep your spot."
      : "Sign your contract by tomorrow 11:59 PM ET to keep your spot.",
    data: { type: "contract" },
  };
}

export function reminderEmail(input: { firstName: string; deadlineIso: string }): { subject: string; text: string; html: string } {
  const paras = [
    { text: `Hi ${input.firstName || "there"},` },
    { text: "Just a quick reminder that your contract still needs your signature." },
    { text: `Please sign it in the KESHAH Creators app by ${deadlineLong(input.deadlineIso)} to keep your spot.`, bold: true },
    { text: "It's the first step when you open the app, and it only takes a couple of minutes." },
    { text: "If anything is holding you up, just reply to this email and I'll help." },
  ];
  const text = [...paras.flatMap((x) => [x.text, ""]), CREATOR_SIGNOFF].join("\n");
  return { subject: "Your KESHAH offer is waiting", text, html: lightEmailHtml(paras) };
}

export function withdrawEmail(input: { firstName: string; deadlineIso: string | null }): { subject: string; text: string; html: string } {
  const by = input.deadlineIso ? ` by ${deadlineLong(input.deadlineIso)}` : "";
  const paras = [
    { text: `Hi ${input.firstName || "there"},` },
    { text: `We weren't able to confirm your spot, because your contract wasn't signed${by}. So we've withdrawn the offer for the content creator role.` },
    { text: "Thank you for your time and for your interest in KESHAH. We wish you all the best." },
  ];
  const text = [...paras.flatMap((x) => [x.text, ""]), CREATOR_SIGNOFF].join("\n");
  return { subject: "Your KESHAH offer", text, html: lightEmailHtml(paras) };
}

// ---------------------------------------------------------------- plans

export class OfferError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Updates for "Give 48 more hours". Sends nothing; clears the reminder so a new one goes out before the new deadline. */
export function planExtend(d: OfferDoc, now: Date): { deadline: string; updates: Record<string, unknown> } {
  const dl = deadlineOf(d);
  if (!dl) throw new OfferError("This creator has no contract deadline.");
  if (str(d.contract?.status) === "signed") throw new OfferError("They've already signed.", 409);
  if (d.withdrawn_at) throw new OfferError("This offer was already withdrawn.", 409);
  const deadline = extendedDeadline(dl, now);
  return {
    deadline,
    updates: {
      contract_deadline_at: deadline,
      contract_reminder_sent_at: null,
      contract_deadline_extended_at: now.toISOString(),
    },
  };
}

/** Updates + email for "Withdraw offer". The group removal is done by the caller (needs Google). */
export function planWithdraw(
  d: OfferDoc,
  now: Date,
  timezone: string,
): { updates: Record<string, unknown>; email: { to: string; subject: string; text: string; html: string } | null; groupEmail: string | null } {
  if (str(d.contract?.status) === "signed") throw new OfferError("They've already signed, so the offer can't be withdrawn here.", 409);
  if (d.withdrawn_at) throw new OfferError("This offer was already withdrawn.", 409);
  const status = str(d.status) || "onboarding";
  if (status !== "onboarding") throw new OfferError("Only an offer that's still being set up can be withdrawn.", 409);
  const to = str(d.email).trim().toLowerCase();
  const mail = withdrawEmail({ firstName: firstNameOf(d), deadlineIso: deadlineOf(d) });
  return {
    updates: {
      status: "ended",
      status_changed_at: now.toISOString(),
      ended_on: dateIn(now, timezone || DEADLINE_TZ),
      withdrawn_at: now.toISOString(),
    },
    email: to ? { to, ...mail } : null,
    groupEmail: str(d.keshah_email).trim().toLowerCase() || null,
  };
}

/** Is this an offer that gets a deadline at accept time? (Not Isai / anyone already working with us.) */
export function getsDeadline(d: { status?: unknown; start_date?: unknown; starting_completed_months?: unknown; contract?: { status?: unknown } | null }): boolean {
  const status = str(d.status);
  if (status === "active" || status === "leaving") return false;
  if (str(d.start_date)) return false;
  if (Number(d.starting_completed_months ?? 0)) return false;
  return str(d.contract?.status) !== "signed";
}

/** The founder app's view of the deadline (creator page): null when there's none. */
export function offerSummary(d: OfferDoc, now: Date): {
  deadline_at: string;
  /** "Tuesday, October 14 at 11:59 PM ET" */
  label: string;
  /** "Oct 14" */
  short: string;
  /** Waiting on their signature (contract sent, unsigned, not withdrawn, onboarding). */
  open: boolean;
  /** Calendar days (ET) past the deadline while open, else 0. */
  past_due_days: number;
  reminder_sent_at: string | null;
  withdrawn_at: string | null;
} | null {
  const dl = deadlineOf(d);
  if (!dl) return null;
  const open = offerOpen(d);
  return {
    deadline_at: dl,
    label: deadlineLong(dl),
    short: deadlineShort(dl),
    open,
    past_due_days: open ? daysPastDue(dl, now) : 0,
    reminder_sent_at: validIso(d.contract_reminder_sent_at),
    withdrawn_at: validIso(d.withdrawn_at),
  };
}

/** What the creator app reads (portal `contract`): the date in ET and the instant. */
export function creatorDeadline(d: OfferDoc): { deadline_at: string; deadline_date: string } | null {
  const dl = deadlineOf(d);
  if (!dl || d.withdrawn_at || str(d.contract?.status) === "signed") return null;
  return { deadline_at: dl, deadline_date: dateIn(new Date(dl)) };
}
