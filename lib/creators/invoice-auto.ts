/**
 * Self-billing: KESHAH prepares and submits each creator's monthly invoice
 * on their behalf (founder-approved, replaces "creator reviews and submits").
 *
 *   - Daily cron (/api/cron/creator-invoices, 09:00 UTC): from the 1st of a
 *     month (creator-local), last month's invoice is drafted if missing and,
 *     while still a draft, submitted with auto_submitted: true and a 3-day
 *     dispute window (dispute_until = submitted_at + 3 days).
 *   - The creator can tap "Something's off?" (POST /api/creator/invoices/dispute)
 *     while the window is open. That flags the invoice (disputed_at, dispute_note);
 *     the status stays "submitted". Admin "Mark resolved" sets dispute_resolved_at.
 *   - Contract: paid "within seven (7) days after the invoice is submitted",
 *     so paid_by = submitted_at + 7 days.
 *
 * Pure helpers + the cron core with injected deps (tests: invoice-auto.test.ts).
 * Nothing here imports Firestore.
 */
import { addMonths, monthOf } from "./pay";
import { lastInvoiceMonth } from "./lifecycle";
import { fmtUsd, localDateIn } from "./time";
import type { CreatorProfile, Invoice, IsoInstant, YyyyMm, YyyyMmDd } from "./types";
import type { PushMessage } from "../push";

export const DISPUTE_WINDOW_DAYS = 3;
export const PAY_WITHIN_DAYS = 7;
const DAY_MS = 86400000;

export class InvoiceRuleError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

function addDaysIso(iso: IsoInstant, days: number): IsoInstant {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

export function disputeUntilFor(submittedAt: IsoInstant): IsoInstant {
  return addDaysIso(submittedAt, DISPUTE_WINDOW_DAYS);
}

export function paidByFor(submittedAt: IsoInstant): IsoInstant {
  return addDaysIso(submittedAt, PAY_WITHIN_DAYS);
}

function safeLocalDate(at: Date, timezone: string | undefined): YyyyMmDd {
  try {
    return localDateIn(at, timezone || "UTC");
  } catch {
    return localDateIn(at, "UTC");
  }
}

/**
 * The calendar date (creator-local) to SHOW as a deadline for `instant`:
 * the last local day that ends at or before it, so "by Oct 3" is never later
 * than the real cut-off in any timezone.
 */
export function deadlineDate(instant: IsoInstant, timezone?: string): YyyyMmDd {
  return safeLocalDate(new Date(Date.parse(instant) - DAY_MS), timezone);
}

/** "Nov 7" for a yyyy-mm-dd. */
export function fmtDayMonth(d: YyyyMmDd): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "October" for a yyyy-mm. */
export function fmtMonthName(month: YyyyMm): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

/** True while the creator may still flag the invoice. */
export function inDisputeWindow(inv: Pick<Invoice, "status" | "dispute_until" | "locked">, now: Date = new Date()): boolean {
  return inv.status === "submitted" && !inv.locked && !!inv.dispute_until && now.getTime() < Date.parse(inv.dispute_until);
}

/** Open dispute = flagged and not yet resolved by the founder. */
export function hasOpenDispute(inv: Pick<Invoice, "disputed_at" | "dispute_resolved_at">): boolean {
  return !!inv.disputed_at && !inv.dispute_resolved_at;
}

/** Validates a dispute and returns the fields to write. Throws InvoiceRuleError. */
export function disputeUpdate(inv: Invoice, rawNote: unknown, now: Date = new Date()): Partial<Invoice> {
  const note = String(rawNote ?? "").trim().slice(0, 2000);
  if (!note) throw new InvoiceRuleError("Tell us what looks wrong.", 400);
  if (inv.status !== "submitted" || inv.locked) throw new InvoiceRuleError(`This invoice is already ${inv.status}.`);
  if (!inv.dispute_until) throw new InvoiceRuleError("This invoice can't be flagged here. Message us on Slack.");
  if (now.getTime() >= Date.parse(inv.dispute_until)) {
    throw new InvoiceRuleError("The review window for this invoice has closed. Message us on Slack.");
  }
  if (hasOpenDispute(inv)) throw new InvoiceRuleError("You already flagged this invoice. We'll get back to you.");
  const iso = now.toISOString();
  return { disputed_at: iso, dispute_note: note, dispute_resolved_at: null, updated_at: iso };
}

/** Fields an auto-submit writes on a draft. */
export function autoSubmitFields(now: Date): Pick<Invoice, "submitted_at" | "auto_submitted" | "dispute_until"> {
  const submitted_at = now.toISOString();
  return { submitted_at, auto_submitted: true, dispute_until: disputeUntilFor(submitted_at) };
}

/** Invoice plus derived dates for the creator app / portal. */
export type InvoiceView = Invoice & {
  /** Instant the contract says payment is due by (submitted_at + 7 days). */
  paid_by: IsoInstant | null;
  /** Same, as the creator-local date to show ("Paid by Nov 7"). */
  paid_by_date: YyyyMmDd | null;
  /** Creator-local date to show for the dispute deadline (null outside auto-submit). */
  dispute_by_date: YyyyMmDd | null;
  /** True while "Something's off?" is allowed. */
  can_dispute: boolean;
};

export function invoiceView(inv: Invoice, timezone?: string, now: Date = new Date()): InvoiceView {
  const paid_by = inv.submitted_at ? paidByFor(inv.submitted_at) : null;
  return {
    ...inv,
    auto_submitted: !!inv.auto_submitted,
    dispute_until: inv.dispute_until ?? null,
    disputed_at: inv.disputed_at ?? null,
    paid_by,
    paid_by_date: paid_by ? deadlineDate(paid_by, timezone) : null,
    dispute_by_date: inv.dispute_until ? deadlineDate(inv.dispute_until, timezone) : null,
    can_dispute: inDisputeWindow(inv, now) && !hasOpenDispute(inv),
  };
}

/**
 * The month the cron should invoice for this creator today, or null:
 * last month (creator-local), only once pay started on/before its last day.
 * After an agreement ends, invoices keep coming through the month the 30-day
 * bonus window closes in (contract §6.5, lifecycle.ts lastInvoiceMonth), so
 * milestones hit after the end are still paid.
 */
export function invoiceMonthDue(
  c: Pick<CreatorProfile, "start_date" | "ended_on" | "timezone">,
  now: Date = new Date(),
): YyyyMm | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.start_date ?? "")) return null;
  const last = addMonths(monthOf(safeLocalDate(now, c.timezone)), -1);
  if (c.start_date > `${last}-31`) return null;
  if (c.ended_on && lastInvoiceMonth(c.ended_on) < last) return null;
  return last;
}

export function invoiceReadyEmail(
  inv: Invoice,
  firstName: string,
  timezone?: string,
  opts: { bankOnFile?: boolean } = {},
): { subject: string; text: string } {
  const month = fmtMonthName(inv.month);
  const paidBy = fmtDayMonth(deadlineDate(paidByFor(inv.submitted_at!), timezone));
  const disputeBy = fmtDayMonth(deadlineDate(inv.dispute_until!, timezone));
  const total = fmtUsd(inv.total_cents);
  // Only promise a bank transfer when we have somewhere to send it.
  const noBank = opts.bankOnFile === false;
  return {
    subject: noBank ? `Your ${month} invoice is in: ${total}. Add your bank details` : `Your ${month} invoice is in: ${total}`,
    text: [
      `Hi ${firstName || "there"},`,
      "",
      noBank
        ? `Your ${month} invoice is in: ${total}. We don't have your bank details yet, so we can't send it.`
        : `Your ${month} invoice is in: ${total}. It'll be paid by bank transfer by ${paidBy}.`,
      ...(noBank
        ? ["", "Add your bank details in the app so we can pay you. Open the app and tap Set up your payments on the Today tab. It takes a minute, and we pay within 7 days of the invoice."]
        : []),
      "",
      `If anything looks wrong, tap "Something's off?" in the app by ${disputeBy}.`,
      "",
      `Invoice ${inv.number}`,
    ].join("\n"),
  };
}

export function invoiceReadyPush(inv: Invoice): PushMessage {
  return {
    title: `Your ${fmtMonthName(inv.month)} invoice is in`,
    body: `${fmtUsd(inv.total_cents)}. Tap to see it.`,
    data: { type: "invoice", number: inv.number },
  };
}

export function disputeFounderEmail(
  creator: Pick<CreatorProfile, "id" | "name" | "legal_name">,
  inv: Invoice,
  note: string,
  siteUrl: string,
): { subject: string; text: string } {
  const who = creator.legal_name || creator.name;
  return {
    subject: `Invoice flagged: ${who} ${inv.number}`,
    text: [
      `${who} tapped "Something's off?" on invoice ${inv.number} (${fmtMonthName(inv.month)}, ${fmtUsd(inv.total_cents)}).`,
      "",
      "Their note:",
      note,
      "",
      `Review window ends ${inv.dispute_until}.`,
      `Admin: ${siteUrl.replace(/\/+$/, "")}/dashboard/creators-pay/${creator.id}`,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------- cron core

export interface AutoSubmitDeps {
  listCreators(): Promise<CreatorProfile[]>;
  /**
   * Drafts for months before `beforeMonth` (an old month the founder sent back
   * to draft for a fix). The cron re-submits them so they're never stuck.
   */
  staleDrafts?(creatorId: string, beforeMonth: YyyyMm): Promise<Invoice[]>;
  /** Bank details on file (manual form or Stripe)? Unset = assume yes. */
  bankOnFile?(creatorId: string): Promise<boolean>;
  /** draftOrGetInvoice: creates/recalculates a draft, returns non-drafts untouched. */
  draftOrGet(creatorId: string, month: YyyyMm, now: Date): Promise<Invoice>;
  /** Transactional draft -> submitted. Returns null when it was no longer a draft. */
  autoSubmit(creatorId: string, number: string, now: Date): Promise<Invoice | null>;
  sendEmail(to: string, subject: string, text: string): Promise<void>;
  push(target: { creatorId: string; email: string | null }, msg: PushMessage): Promise<unknown>;
}

export interface AutoSubmitRow {
  id: string;
  name: string;
  month: YyyyMm;
  number?: string;
  total_cents?: number;
  result: string;
}

export async function runInvoiceAutoSubmit(
  deps: AutoSubmitDeps,
  opts: { now?: Date; dry?: boolean } = {},
): Promise<AutoSubmitRow[]> {
  const now = opts.now ?? new Date();
  const rows: AutoSubmitRow[] = [];
  const creators = await deps.listCreators();
  for (const c of creators) {
    const month = invoiceMonthDue(c, now);
    if (!month) continue;
    // An older month sent back to draft (a correction) goes in again first, then last month.
    const stale = opts.dry || !deps.staleDrafts ? [] : await deps.staleDrafts(c.id, month).catch(() => [] as Invoice[]);
    for (const m of [...new Set(stale.map((i) => i.month))].sort()) {
      rows.push(await submitOne(deps, c, m, now, false));
    }
    rows.push(await submitOne(deps, c, month, now, !!opts.dry));
  }
  return rows;
}

async function submitOne(deps: AutoSubmitDeps, c: CreatorProfile, month: YyyyMm, now: Date, dry: boolean): Promise<AutoSubmitRow> {
  const row: AutoSubmitRow = { id: c.id, name: c.name, month, result: "" };
  try {
    if (dry) {
      row.result = "would check";
      return row;
    }
    const draft = await deps.draftOrGet(c.id, month, now);
    row.number = draft.number;
    row.total_cents = draft.total_cents;
    if (draft.status !== "draft") {
      row.result = `already ${draft.status}`;
      return row;
    }
    const inv = await deps.autoSubmit(c.id, draft.number, now);
    if (!inv) {
      row.result = "already submitted";
      return row;
    }
    row.total_cents = inv.total_cents;
    row.result = "submitted";
    if (inv.total_cents === 0) {
      row.result = "submitted (zero, no email)";
      return row;
    }
    const bank = deps.bankOnFile ? await deps.bankOnFile(c.id).catch(() => true) : true;
    if (!bank) row.result += ", no bank details";
    const to = c.email || c.keshah_email;
    if (to) {
      const mail = invoiceReadyEmail(inv, (c.name || "").trim().split(/\s+/)[0], c.timezone, { bankOnFile: bank });
      try {
        await deps.sendEmail(to, mail.subject, mail.text);
        row.result += ", emailed";
      } catch (e) {
        row.result += `, email failed: ${e instanceof Error ? e.message : e}`;
      }
    }
    await deps.push({ creatorId: c.id, email: c.email || null }, invoiceReadyPush(inv));
  } catch (e) {
    row.result = `error: ${e instanceof Error ? e.message : e}`;
  }
  return row;
}
