/**
 * The founder app's Creators list for a period (a month or all time).
 *
 * Pay is what the contract pays, not what's accrued so far:
 *   - the current month: the month's base (prorated to their start date),
 *     less days already missed, plus that month's bonuses and adjustments,
 *     plus trial pay (the same "Next payout" the creator sees);
 *   - a past month: its invoice total, else the month's summary;
 *   - all time: every month added up (the current month as above).
 * Brought in = first-charge proceeds of users on their campaign tags who
 * converted in the period (the same estimate as the web Creator pay table).
 */
import {
  attributionFor,
  listCreators,
  loadHistory,
  summaryFor,
  todayIn,
  type AdminCreator,
} from "@/lib/creators/admin";
import { addMonths, completeVideoCount, trialStatus } from "@/lib/creators/pay";
import { db } from "@/lib/creators/admin";
import { CREATORS_COLLECTION } from "@/lib/creators/db";
import type { MonthSummary } from "@/lib/creators/pay";
import { payProfileOf } from "@/lib/creators/admin";

export interface FounderCreatorRow {
  id: string;
  name: string;
  status: string;
  email: string;
  campaignTags: string[];
  trial: { day: number; of: number; reviewing: boolean; ended: boolean; promotedOn: string | null } | null;
  levelBaseCents: number | null;
  /** Contract pay for the period (see header). */
  payCents: number;
  pay: { baseCents: number; bonusCents: number; trialCents: number; adjustmentCents: number; missedDays: number; missedCents: number };
  postedDays: number;
  expectedDays: number;
  missedDays: number;
  broughtInUsd: number;
  trials: number;
  paidUsers: number;
  roi: number | null;
  onboarding?: { done: number; total: number };
  /** Videos posted in the period (each on both apps counts once). */
  videos: number;
  /** Views on their posts from the period (TikTok + Instagram, current counts). */
  views: number;
  topVideo: { url: string; platform: string; views: number; thumbnail: string | null } | null;
}

const DAY_MS = 86_400_000;

function monthWindow(ym: string): [number, number] {
  const [y, m] = ym.split("-").map(Number);
  return [Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1)];
}

/** Contract pay for one month of a summary; the current month is projected to its end. */
function monthPay(s: MonthSummary, current: boolean) {
  const bonusCents = s.bonusLines.reduce((a, l) => a + l.amount_cents, 0);
  const adjustmentCents = s.adjustmentLines.reduce((a, l) => a + l.amount_cents, 0);
  const trialCents = s.trialCents ?? 0;
  const cal = s.calendarWeekdays || 1;
  const baseExpected = s.baseExpectedWeekdays ?? s.expectedWeekdays;
  const baseCredited = s.baseCreditedDays ?? s.postedDays + s.approvedOffDays;
  // Base days still possible this month = credited so far + weekdays not yet passed.
  const missedBase = Math.max(0, baseExpected - baseCredited - (current ? s.pendingDays : 0));
  const baseCents = current
    ? Math.round((s.levelBaseCents * Math.max(0, baseExpected - missedBase)) / cal)
    : s.baseDueCents;
  const missedCents = Math.round((s.levelBaseCents * missedBase) / cal);
  return { baseCents, bonusCents, trialCents, adjustmentCents, missedDays: s.missedDays, missedCents };
}

export async function founderCreators(period: string): Promise<FounderCreatorRow[]> {
  const all = (await listCreators()).filter((c) => c.pay_ready || c.legal_name);
  return Promise.all(all.map((c) => row(c, period)));
}

async function row(c: AdminCreator, period: string): Promise<FounderCreatorRow> {
  const today = todayIn(c.timezone);
  const thisMonth = today.slice(0, 7);
  const h = await loadHistory(c.id, { contractSigned: c.contract.status === "signed" });
  const first = (c.start_date || thisMonth).slice(0, 7);
  const months: string[] = [];
  if (period === "all") {
    for (let m = first; m <= thisMonth; m = addMonths(m, 1)) months.push(m);
  } else {
    months.push(period);
  }
  const pay = { baseCents: 0, bonusCents: 0, trialCents: 0, adjustmentCents: 0, missedDays: 0, missedCents: 0 };
  let payCents = 0;
  let posted = 0;
  let expected = 0;
  let missed = 0;
  let level: number | null = null;
  for (const m of months) {
    const s = summaryFor(c, h, m);
    if (!s) continue;
    const current = m === thisMonth;
    const inv = h.invoices.find((i) => i.month === m && i.status !== "draft");
    const p = monthPay(s, current);
    const monthTotal = !current && inv ? inv.total_cents : p.baseCents + p.bonusCents + p.trialCents + p.adjustmentCents;
    payCents += monthTotal;
    pay.baseCents += p.baseCents;
    pay.bonusCents += p.bonusCents;
    pay.trialCents += p.trialCents;
    pay.adjustmentCents += p.adjustmentCents;
    pay.missedDays += p.missedDays;
    pay.missedCents += p.missedCents;
    posted += s.postedDays;
    expected += s.expectedWeekdays - (current ? s.pendingDays : 0);
    missed += s.missedDays;
    if (current || m === months[months.length - 1]) level = s.levelBaseCents;
  }
  const [from, to] = period === "all" ? [0, Date.now() + DAY_MS] : monthWindow(period);
  const fromDate = new Date(from).toISOString().slice(0, 10);
  const toDate = new Date(to).toISOString().slice(0, 10);
  const [attr, postsSnap] = await Promise.all([
    attributionFor(c.campaign_tags, from, to),
    period === "all"
      ? db().collection(CREATORS_COLLECTION).doc(c.id).collection("posts").select("platform", "url", "views", "handle", "thumbnail_url", "local_date", "pinned").get()
      : db().collection(CREATORS_COLLECTION).doc(c.id).collection("posts").where("local_date", ">=", fromDate).where("local_date", "<", toDate).select("platform", "url", "views", "handle", "thumbnail_url", "local_date", "pinned").get(),
  ]);
  // Only posts from their current handles (an old account's posts stay stored but don't count).
  const norm = (h: unknown) => String(h ?? "").trim().replace(/^@/, "").toLowerCase();
  const handles: Record<string, string> = { tiktok: norm(c.tiktok_handle), instagram: norm(c.instagram_handle) };
  let views = 0;
  let top: FounderCreatorRow["topVideo"] = null;
  for (const d of postsSnap.docs) {
    const x = d.data();
    const want = handles[String(x.platform)];
    if (want && x.handle && norm(x.handle) !== want) continue;
    if (x.pinned) continue;
    const v = Number(x.views ?? 0) || 0;
    views += v;
    if (!top || v > top.views) top = { url: String(x.url ?? ""), platform: String(x.platform ?? ""), views: v, thumbnail: (x.thumbnail_url as string) || null };
  }
  const videos = h.postingDays
    .filter((p) => p.date >= fromDate && p.date < toDate)
    .reduce((a, p) => a + completeVideoCount(p), 0);
  const ts = c.trial_plan && c.pay_ready ? trialStatus(h.postingDays, payProfileOf(c)) : null;
  return {
    id: c.id,
    name: c.name || c.legal_name,
    status: c.status_display,
    email: c.email,
    campaignTags: c.campaign_tags,
    trial: ts ? { day: ts.postedDays, of: ts.requiredDays ?? 20, reviewing: !!ts.reviewing, ended: !!ts.ended, promotedOn: ts.promotedOn ?? null } : null,
    levelBaseCents: c.pay_ready ? level : null,
    payCents,
    pay,
    postedDays: posted,
    expectedDays: expected,
    missedDays: missed,
    broughtInUsd: Math.round(attr.proceedsInWindowUsd * 100) / 100,
    trials: attr.trialsInWindow,
    paidUsers: attr.purchasesInWindow,
    roi: payCents > 0 ? attr.proceedsInWindowUsd / (payCents / 100) : null,
    onboarding: h.onboarding ? { done: h.onboarding.done, total: h.onboarding.total } : undefined,
    videos,
    views,
    topVideo: top,
  };
}
