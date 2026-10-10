/**
 * One-time announcement of the bonus timing change (lib/creators/pay.ts
 * BONUS_HIT_MONTH_RULE_FROM): a push to each creator who still has old-rule
 * bonuses due (Isai's September videos on the October invoice).
 *
 * OFF by default. It only sends when the env flag BONUS_TIMING_ANNOUNCE_ENABLED
 * is "1"; GET /api/cron/bonus-timing-announce?dry=1 lists who would get it.
 * Each creator gets it at most once (ContentCreators.bonus_timing_announced_at).
 */
import { BONUS_HIT_MONTH_RULE_FROM, addMonths, monthOf } from "./pay";
import { paydayLabel, type PushMessage } from "../push";
import type { Cents, InvoiceLine, YyyyMm } from "./types";

export const BONUS_TIMING_ANNOUNCE_FLAG = "BONUS_TIMING_ANNOUNCE_ENABLED";

/** The invoice month that carries the last old-rule bonuses (October 2026). */
export const LAST_OLD_RULE_INVOICE_MONTH: YyyyMm = monthOf(BONUS_HIT_MONTH_RULE_FROM);

export function announceEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[BONUS_TIMING_ANNOUNCE_FLAG] === "1";
}

/** Old-rule bonus cents on a set of invoice lines (lines without `rule` predate the change: old). */
export function oldRuleBonusCents(lines: InvoiceLine[]): Cents {
  return lines.filter((l) => String(l.kind).startsWith("bonus") && l.rule !== "new").reduce((a, l) => a + l.amount_cents, 0);
}

function dollars(cents: Cents): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** "Bonuses now come sooner": the same words as the app's one-time card. */
export function bonusTimingPush(oldCents: Cents, invoiceMonth: YyyyMm = LAST_OLD_RULE_INVOICE_MONTH): PushMessage {
  const monthName = new Date(`${addMonths(invoiceMonth, -1)}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return {
    title: "Bonuses now come sooner",
    body: `When a video hits 100K or 1M views, the bonus now comes on your next payday instead of a month later. Your ${monthName} bonuses (${dollars(oldCents)}) still come on ${paydayLabel(addMonths(invoiceMonth, 1))}.`,
    data: { type: "bonus_timing" },
  };
}

export interface AnnounceDeps {
  listCreators(): Promise<{ id: string; name: string; email: string }[]>;
  /** Old-rule bonuses still owed on the creator's (unpaid) October invoice, or 0. */
  oldRuleDue(creatorId: string): Promise<Cents>;
  alreadySent(creatorId: string): Promise<boolean>;
  markSent(creatorId: string, at: string): Promise<void>;
  push(target: { creatorId: string; email: string | null }, msg: PushMessage): Promise<unknown>;
}

export interface AnnounceRow {
  id: string;
  name: string;
  old_rule_cents: number;
  result: string;
}

/** Sends (or with dry, lists) the announcement. Never sends twice to one creator. */
export async function runBonusTimingAnnouncement(deps: AnnounceDeps, opts: { dry?: boolean; now?: Date } = {}): Promise<AnnounceRow[]> {
  const rows: AnnounceRow[] = [];
  for (const c of await deps.listCreators()) {
    const cents = await deps.oldRuleDue(c.id);
    if (cents <= 0) continue;
    const row: AnnounceRow = { id: c.id, name: c.name, old_rule_cents: cents, result: "" };
    rows.push(row);
    if (await deps.alreadySent(c.id)) {
      row.result = "already sent";
      continue;
    }
    if (opts.dry) {
      row.result = `would send: ${bonusTimingPush(cents).body}`;
      continue;
    }
    await deps.markSent(c.id, (opts.now ?? new Date()).toISOString());
    await deps.push({ creatorId: c.id, email: c.email || null }, bonusTimingPush(cents));
    row.result = "sent";
  }
  return rows;
}
