/**
 * Pure lifecycle rules shared by the portal, the founder app and the crons.
 * No Firestore here (tests: lifecycle.test.ts).
 *
 *   First posting day     the next weekday after Getting started is finished
 *                         (warm-up done AND the link step ticked). The day the
 *                         warm-up ends is never a posting day.
 *   After the end         contract §6.5: bonuses for videos posted on or before
 *                         ended_on still count when hit within 30 days, so posts
 *                         keep syncing until ended_on + 30 days and invoices keep
 *                         coming through the month that window ends in.
 *   Adjustments           an adjustment for a month whose invoice is already
 *                         submitted (or paid) moves to the next open month, with
 *                         a note saying where it came from.
 *   Approved claims       approving a bonus claim records the milestone date the
 *                         calculator needs (crossed_100k_on / crossed_1m_on).
 */
import { BONUS_WINDOW_DAYS, addMonths, isWeekday, localDate, monthOf } from "./pay";
import type { BonusClaim, Invoice, YyyyMm, YyyyMmDd } from "./types";

const DAY_MS = 86_400_000;

function parse(d: YyyyMmDd): number {
  return Date.parse(`${d}T00:00:00Z`);
}

function fmt(ms: number): YyyyMmDd {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: YyyyMmDd, n: number): YyyyMmDd {
  return fmt(parse(d) + n * DAY_MS);
}

/** The first weekday strictly after `d`. */
export function nextWeekdayAfter(d: YyyyMmDd): YyyyMmDd {
  let t = parse(d) + DAY_MS;
  while (!isWeekday(fmt(t))) t += DAY_MS;
  return fmt(t);
}

function safeLocal(iso: string, tz: string): YyyyMmDd | null {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  try {
    return localDate(iso, tz || "UTC");
  } catch {
    return localDate(iso, "UTC");
  }
}

/**
 * The creator's first posting day: the next weekday after the creator-local
 * day Getting started was finished. Null until it's finished.
 */
export function firstPostingDay(completedAtIso: string | null | undefined, timezone: string): YyyyMmDd | null {
  const done = completedAtIso ? safeLocal(completedAtIso, timezone) : null;
  return done ? nextWeekdayAfter(done) : null;
}

/** "Monday, October 13" for a yyyy-mm-dd. */
export function fmtWeekdayLong(d: YyyyMmDd): string {
  return new Date(parse(d)).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** "Oct 13" for a yyyy-mm-dd. */
export function fmtShort(d: YyyyMmDd): string {
  return new Date(parse(d)).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// ---------------------------------------------------------------- after the end

/** Bonus window after the last working day (contract §6.5). */
export const POST_END_DAYS = BONUS_WINDOW_DAYS;

/** Last day a video posted on ended_on can still hit a milestone. */
export function postEndUntil(endedOn: YyyyMmDd): YyyyMmDd {
  return addDays(endedOn, POST_END_DAYS);
}

/** Still syncing posts / checking bonuses for an ended creator on `today`? */
export function inPostEndWindow(endedOn: YyyyMmDd | null | undefined, today: YyyyMmDd): boolean {
  return !!endedOn && today <= postEndUntil(endedOn);
}

/** The last month an ended creator is invoiced for (the month the bonus window closes in). */
export function lastInvoiceMonth(endedOn: YyyyMmDd): YyyyMm {
  return monthOf(postEndUntil(endedOn));
}

// ---------------------------------------------------------------- adjustments

/** Is this month's invoice frozen (anything past draft never recalculates)? */
export function monthFrozen(month: YyyyMm, invoices: Pick<Invoice, "month" | "status" | "locked">[]): boolean {
  return invoices.some((i) => i.month === month && (i.status !== "draft" || i.locked));
}

/**
 * Where an adjustment for `month` lands: `month` itself while its invoice is
 * still a draft (or doesn't exist), else the first later month that is open.
 */
export function adjustmentTarget(
  month: YyyyMm,
  invoices: Pick<Invoice, "month" | "status" | "locked">[],
): { month: YyyyMm; carriedFrom: YyyyMm | null } {
  let m = month;
  for (let n = 0; n < 240 && monthFrozen(m, invoices); n++) m = addMonths(m, 1);
  return { month: m, carriedFrom: m === month ? null : month };
}

/** "Bonus fix (carried from September 2026)". */
export function carriedNote(note: string, from: YyyyMm): string {
  const [y, mo] = from.split("-").map(Number);
  const name = new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return `${note || "Adjustment"} (carried from ${name})`;
}

// ---------------------------------------------------------------- bonus claims

/**
 * The milestone date(s) to record when the founder approves a claim, unless
 * it already has them: the level the claimed views reach (1M also covers
 * 100K), dated the day the claim was sent (creator-local), else its posting
 * day. Approving says "they hit it inside the 30-day window", so a claim sent
 * later than that is dated the window's last day.
 */
export function approvedClaimDates(
  claim: Pick<BonusClaim, "posted_on" | "views_claimed" | "claimed_at" | "crossed_100k_on" | "crossed_1m_on">,
  timezone: string,
): Partial<Pick<BonusClaim, "crossed_100k_on" | "crossed_1m_on">> {
  if (claim.crossed_100k_on || claim.crossed_1m_on) return {};
  const views = Number(claim.views_claimed) || 0;
  if (views < 100_000) return {};
  const sent = claim.claimed_at ? safeLocal(claim.claimed_at, timezone) : null;
  const posted = claim.posted_on;
  const last = addDays(posted, BONUS_WINDOW_DAYS);
  let at = sent && sent >= posted ? sent : posted;
  if (at > last) at = last;
  return views >= 1_000_000 ? { crossed_1m_on: at } : { crossed_100k_on: at };
}

// ---------------------------------------------------------------- bank details

export interface BankLabelInput {
  status: string;
  last4: string | null;
}

/** "Bank ••1234", "Bank details in" (no last 4 known) or "No bank details". */
export function bankLabel(b: BankLabelInput | null | undefined): string {
  if (!b || b.status === "missing") return "No bank details";
  return b.last4 ? `Bank ••${b.last4}` : "Bank details in";
}

// ---------------------------------------------------------------- final pay

/** The date the invoice for `month` is paid by: submitted on the 1st of the next month, paid within 7 days. */
export function payByForMonth(month: YyyyMm): YyyyMmDd {
  return `${addMonths(month, 1)}-08`;
}

/**
 * Trial pay still to come after "Don't continue": the trial's days at $15
 * less trial lines on invoices already paid.
 */
export function unpaidTrialCents(trialDays: number, dayCents: number, invoices: Pick<Invoice, "status" | "lines">[]): number {
  const paid = invoices
    .filter((i) => i.status === "paid")
    .flatMap((i) => i.lines ?? [])
    .filter((l) => l.kind === "trial")
    .reduce((a, l) => a + l.amount_cents, 0);
  return Math.max(0, trialDays * dayCents - paid);
}

/**
 * What an ended creator is still owed and when it arrives: every unpaid
 * invoice through their last invoice month, plus `openCents` (the month of
 * ended_on, when it has no invoice yet). Paid-by is the latest of those.
 */
export function finalPayFor(
  endedOn: YyyyMmDd,
  invoices: Pick<Invoice, "month" | "status" | "total_cents" | "submitted_at">[],
  openCents: number,
): { cents: number; payBy: YyyyMmDd | null } {
  const last = lastInvoiceMonth(endedOn);
  const unpaid = invoices.filter((i) => i.status !== "paid" && i.month <= last && i.status !== "draft");
  const drafts = invoices.filter((i) => i.status === "draft" && i.month <= last);
  const endMonth = monthOf(endedOn);
  const hasEndInvoice = invoices.some((i) => i.month === endMonth && i.status !== "draft");
  let cents = unpaid.reduce((a, i) => a + i.total_cents, 0);
  if (!hasEndInvoice) cents += Math.max(0, openCents);
  // Drafts from earlier months the cron hasn't submitted yet (the end month's draft is openCents).
  cents += drafts.filter((i) => i.month !== endMonth).reduce((a, i) => a + i.total_cents, 0);
  const months = [...unpaid.map((i) => i.month), ...drafts.map((i) => i.month), ...(hasEndInvoice ? [] : [endMonth])].sort();
  const latest = months[months.length - 1];
  let payBy: YyyyMmDd | null = latest ? payByForMonth(latest) : null;
  // A submitted invoice: 7 days after it went in.
  for (const i of unpaid) {
    if (i.month === latest && i.submitted_at) payBy = new Date(Date.parse(i.submitted_at) + 7 * DAY_MS).toISOString().slice(0, 10);
  }
  return { cents, payBy: cents > 0 ? payBy : null };
}
