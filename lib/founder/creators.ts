/**
 * The founder app's Creators list for a period (a month or all time).
 *
 * Cost (what ROI and net profit use) is what the period's WORK costs: that
 * period's base / trial pay / adjustments plus the bonuses its videos earned,
 * even though bonuses are paid the month after. So a 100K video posted in
 * October counts against October, not November.
 *
 * Payout (shown on the creator page) is the cash for the period:
 *   - the current month: the month's base (prorated to their start date),
 *     less days already missed, plus that month's bonuses and adjustments,
 *     plus trial pay (the same "Next payout" the creator sees);
 *   - a past month: its invoice total, else the month's summary;
 *   - all time: every month added up (the current month as above).
 * Proceeds (broughtInUsd, the field keeps its old name) = RevenueCat proceeds in
 * the period from users whose attribution campaign is one of the creator's
 * campaign tags (RevenueCat's own split).
 *
 * Top videos = their 5 most-viewed videos posted in the period, a TikTok and an
 * Instagram post of the same video counted once (see ./top-videos.ts).
 */
import {
  attributionFor,
  listCreators,
  loadHistory,
  summaryFor,
  todayIn,
  type AdminCreator,
} from "@/lib/creators/admin";
import { addMonths, bonusLinesForMonth, completeVideoCount, trialStatus } from "@/lib/creators/pay";
import { rcRevenueByCampaign, rcValuePerUser } from "@/lib/revenue";
import { countryStats, groupCountries, type CountryGroup } from "./countries";
import { db } from "@/lib/creators/admin";
import { CREATORS_COLLECTION } from "@/lib/creators/db";
import type { MonthSummary } from "@/lib/creators/pay";
import { payProfileOf } from "@/lib/creators/admin";
import { ALL_TIME_START, clampStart } from "./start";
import { bonusByPost, pairVideos, topByViews, TOP_VIDEOS, type PostLite, type TopVideo } from "./top-videos";

export interface FounderCreatorRow {
  id: string;
  name: string;
  status: string;
  email: string;
  campaignTags: string[];
  trial: { day: number; of: number; reviewing: boolean; ended: boolean; promotedOn: string | null } | null;
  levelBaseCents: number | null;
  /** Cost of the period's work: base + trial + adjustments + bonuses its videos earned (see header). */
  payCents: number;
  /** payCents with the open month's base projected to month end (if they keep posting); equals payCents for closed months. */
  committedCents: number;
  /** Cash paid / payable for the period's invoice (bonuses here are last month's videos). */
  payoutCents: number;
  pay: { baseCents: number; bonusCents: number; trialCents: number; adjustmentCents: number; missedDays: number; missedCents: number };
  postedDays: number;
  expectedDays: number;
  missedDays: number;
  /** Proceeds: RevenueCat proceeds from their campaigns in the period; null when RevenueCat didn't answer. */
  broughtInUsd: number | null;
  trials: number;
  paidUsers: number;
  roi: number | null;
  onboarding?: { done: number; total: number };
  /** Videos posted in the period (each on both apps counts once). */
  videos: number;
  /** Views on their posts from the period (TikTok + Instagram, current counts). */
  views: number;
  /** Their most-viewed video in the period (kept for older app builds; same as topVideos[0], one platform). */
  topVideo: { url: string; platform: string; views: number; thumbnail: string | null } | null;
  /** Their 5 most-viewed videos posted in the period, TikTok + Instagram of one video counted once. */
  topVideos: TopVideo[];
  /** Cash: every invoice, newest first (an invoice for month M is paid early in M+1). */
  payouts: Payout[];
  /** The current month's invoice as it stands (paid early next month), split like an invoice: base / trial for this month, bonuses from last month's videos. Null once invoiced or when the period doesn't include this month. */
  upcomingPayout: { month: string; totalCents: number; baseCents: number; bonusCents: number; trialCents: number; otherCents: number } | null;
  /** Cash paid out in the period: invoices whose payout month is in it (all of them for all time). */
  paidOutCents: number;
  /** Installs from their link in the period (RevenueCat new customers on their campaigns). */
  installs: number | null;
  /** PPI: RevenueCat proceeds in each install's first 7 days, averaged (the field keeps its old name). */
  rpiUsd: number | null;
  /** The same in gross revenue (before store fees). */
  rpiGrossUsd: number | null;
  /** Cost per install: their cost for the period / installs. */
  cpiUsd: number | null;
  /** Their installs by US / Tier 1 / Tier 2 / India, with countries (RevenueCat). */
  countryGroups: CountryGroup[] | null;
}

export interface Payout {
  /** The work month the invoice covers. */
  month: string;
  /** The month the money goes out (month + 1). */
  payoutMonth: string;
  totalCents: number;
  baseCents: number;
  bonusCents: number;
  trialCents: number;
  otherCents: number;
  status: string;
  paidAt: string | null;
  /** Due date (submitted + 7 days) while unpaid. */
  dueBy: string | null;
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
  const excluded = new Set(
    (await db().collection(CREATORS_COLLECTION).where("exclude_from_reports", "==", true).select().get()).docs.map((d) => d.id),
  );
  const all = (await listCreators()).filter((c) => (c.pay_ready || c.legal_name) && !excluded.has(c.id));
  const [from, to] = period === "all" ? [0, Date.now() + DAY_MS] : monthWindow(period);
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const startDate = clampStart(day(from));
  const endDate = day(Math.min(to - DAY_MS, Date.now()));
  let byCampaign: Map<string, number> | null = null;
  try {
    byCampaign = new Map([...(await rcRevenueByCampaign(startDate, endDate, "proceeds"))].map(([k, v]) => [k.trim().toLowerCase(), v]));
  } catch (e) {
    console.error("founder creators: RevenueCat by campaign failed:", e instanceof Error ? e.message : e);
  }
  return Promise.all(all.map((c) => row(c, period, byCampaign)));
}

async function row(c: AdminCreator, period: string, byCampaign: Map<string, number> | null): Promise<FounderCreatorRow> {
  const today = todayIn(c.timezone);
  const thisMonth = today.slice(0, 7);
  const h = await loadHistory(c.id, { contractSigned: c.contract.status === "signed" });
  // Cost paid outside the system (e.g. Isai's September base before pay moved here):
  // ContentCreators.off_system_costs { "yyyy-mm": cents }. Counts toward cost / ROI only, never invoices.
  const offSnap = await db().collection(CREATORS_COLLECTION).doc(c.id).get();
  const offSystem = (offSnap.get("off_system_costs") ?? {}) as Record<string, number>;
  const offMonths = Object.keys(offSystem).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
  const bonusStart = [...h.bonusClaims.map((b) => b.posted_on).filter(Boolean), ...offMonths.map((m) => `${m}-01`)].sort()[0];
  const first = [c.start_date || thisMonth, bonusStart || thisMonth].sort()[0].slice(0, 7);
  const months: string[] = [];
  if (period === "all") {
    for (let m = first; m <= thisMonth; m = addMonths(m, 1)) months.push(m);
  } else {
    months.push(period);
  }
  const pay = { baseCents: 0, bonusCents: 0, trialCents: 0, adjustmentCents: 0, missedDays: 0, missedCents: 0 };
  let payCents = 0;
  let committedCents = 0;
  let payoutCents = 0;
  let posted = 0;
  let expected = 0;
  let missed = 0;
  let level: number | null = null;
  let upcomingPayout: FounderCreatorRow["upcomingPayout"] = null;
  for (const m of months) {
    const s = summaryFor(c, h, m);
    if (!s) continue;
    const current = m === thisMonth;
    const inv = h.invoices.find((i) => i.month === m && i.status !== "draft");
    const p = monthPay(s, current);
    payoutCents += !current && inv ? inv.total_cents : p.baseCents + p.bonusCents + p.trialCents + p.adjustmentCents;
    if (current && !inv) {
      upcomingPayout = {
        month: m,
        totalCents: p.baseCents + p.bonusCents + p.trialCents + p.adjustmentCents,
        baseCents: p.baseCents,
        bonusCents: p.bonusCents,
        trialCents: p.trialCents,
        otherCents: p.adjustmentCents,
      };
    }
    // Bonuses earned by THIS month's videos (they're settled on next month's invoice).
    const earned = bonusLinesForMonth(h.bonusClaims, addMonths(m, 1)).reduce((a, l) => a + l.amount_cents, 0);
    const off = Number(offSystem[m] ?? 0) || 0;
    // Cost = what the work has earned so far (this month: base up to today, like
    // the money it's compared with); the payout above stays the full-month projection.
    const baseEarned = current ? s.baseDueCents : p.baseCents;
    payCents += baseEarned + p.trialCents + p.adjustmentCents + earned + off;
    committedCents += (current ? Math.max(p.baseCents, baseEarned) : baseEarned) + p.trialCents + p.adjustmentCents + earned + off;
    pay.baseCents += baseEarned + off;
    pay.bonusCents += earned;
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
  // All time starts at ALL_TIME_START (lib/founder/start.ts) for posts too.
  const fromDate = clampStart(new Date(from).toISOString().slice(0, 10));
  const toDate = new Date(to).toISOString().slice(0, 10);
  const payouts: Payout[] = h.invoices
    .filter((inv) => inv.status !== "draft")
    .map((inv) => {
      const sum = (pred: (k: string) => boolean) => (inv.lines ?? []).filter((l) => pred(String(l.kind))).reduce((a, l) => a + l.amount_cents, 0);
      const baseCents = sum((k) => k === "base");
      const bonusCents = sum((k) => k.startsWith("bonus"));
      const trialCents = sum((k) => k === "trial");
      const submitted = inv.submitted_at ? Date.parse(inv.submitted_at) : NaN;
      return {
        month: inv.month,
        payoutMonth: addMonths(inv.month, 1),
        totalCents: inv.total_cents,
        baseCents,
        bonusCents,
        trialCents,
        otherCents: inv.total_cents - baseCents - bonusCents - trialCents,
        status: inv.status,
        paidAt: inv.paid_at ?? null,
        dueBy: inv.status !== "paid" && Number.isFinite(submitted) ? new Date(submitted + 7 * DAY_MS).toISOString().slice(0, 10) : null,
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
  // Cash actually sent: paid invoices, by the month they were paid.
  const paidOutCents = payouts
    .filter((p) => p.status === "paid" && (period === "all" || (p.paidAt ?? "").slice(0, 7) === period))
    .reduce((a, p) => a + p.totalCents, 0);
  const startDay = new Date(from).toISOString().slice(0, 10);
  const endDay = new Date(Math.min(to - DAY_MS, Date.now())).toISOString().slice(0, 10);
  const countryGroups = c.campaign_tags.length
    ? await countryStats(clampStart(startDay), endDay, [{ name: "attribution_campaign", values: c.campaign_tags }])
        .then(groupCountries)
        .catch((e) => {
          console.error("creator countries:", e instanceof Error ? e.message : e);
          return null;
        })
    : null;
  const value = c.campaign_tags.length
    ? await rcValuePerUser(clampStart(startDay), endDay, [{ name: "attribution_campaign", values: c.campaign_tags }]).catch((e) => {
        console.error("creator value per install:", e instanceof Error ? e.message : e);
        return null;
      })
    : null;
  const broughtIn = byCampaign === null ? null : c.campaign_tags.reduce((a, t) => a + (byCampaign.get(t.trim().toLowerCase()) ?? 0), 0);
  const postFields = ["platform", "url", "views", "handle", "thumbnail_url", "local_date", "posted_at", "pinned"];
  const [attr, postsSnap] = await Promise.all([
    attributionFor(c.campaign_tags, from, to),
    period === "all"
      ? db().collection(CREATORS_COLLECTION).doc(c.id).collection("posts").where("local_date", ">=", ALL_TIME_START).select(...postFields).get()
      : db().collection(CREATORS_COLLECTION).doc(c.id).collection("posts").where("local_date", ">=", fromDate).where("local_date", "<", toDate).select(...postFields).get(),
  ]);
  // Only posts from their current handles (an old account's posts stay stored but don't count).
  const norm = (h: unknown) => String(h ?? "").trim().replace(/^@/, "").toLowerCase();
  const handles: Record<string, string> = { tiktok: norm(c.tiktok_handle), instagram: norm(c.instagram_handle) };
  let views = 0;
  let top: FounderCreatorRow["topVideo"] = null;
  const counted: PostLite[] = [];
  for (const d of postsSnap.docs) {
    const x = d.data();
    const want = handles[String(x.platform)];
    if (want && x.handle && norm(x.handle) !== want) continue;
    if (x.pinned) continue;
    const v = Number(x.views ?? 0) || 0;
    views += v;
    if (!top || v > top.views) top = { url: String(x.url ?? ""), platform: String(x.platform ?? ""), views: v, thumbnail: (x.thumbnail_url as string) || null };
    counted.push({
      platform: String(x.platform ?? ""),
      url: String(x.url ?? ""),
      views: v,
      postedAt: String(x.posted_at ?? ""),
      localDate: String(x.local_date ?? ""),
      thumbnail: (x.thumbnail_url as string) || null,
    });
  }
  const topVideos = topByViews(pairVideos(counted, bonusByPost(h.bonusClaims)));
  // Videos per day: the posting log, or (days before the log existed, e.g. Isai's
  // September) the synced posts: a video = one TikTok + one Instagram post that day.
  const logged = new Map<string, number>();
  for (const p of h.postingDays) if (p.date >= fromDate && p.date < toDate) logged.set(p.date, (logged.get(p.date) ?? 0) + completeVideoCount(p));
  const perDayPosts = new Map<string, { tiktok: number; instagram: number }>();
  for (const d of postsSnap.docs) {
    const x = d.data();
    const want = handles[String(x.platform)];
    if (x.pinned || (want && x.handle && norm(x.handle) !== want)) continue;
    const day = String(x.local_date ?? "");
    if (!day) continue;
    const e = perDayPosts.get(day) ?? { tiktok: 0, instagram: 0 };
    if (x.platform === "tiktok") e.tiktok++;
    else if (x.platform === "instagram") e.instagram++;
    perDayPosts.set(day, e);
  }
  let videos = 0;
  for (const day of new Set([...logged.keys(), ...perDayPosts.keys()])) {
    const fromPosts = perDayPosts.get(day);
    videos += Math.max(logged.get(day) ?? 0, fromPosts ? Math.min(fromPosts.tiktok, fromPosts.instagram) : 0);
  }
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
    committedCents,
    payoutCents,
    pay,
    postedDays: posted,
    expectedDays: expected,
    missedDays: missed,
    broughtInUsd: broughtIn === null ? null : Math.round(broughtIn * 100) / 100,
    trials: attr.trialsInWindow,
    paidUsers: attr.purchasesInWindow,
    // All time counts this month's whole committed pay (same cost the app shows); a month's own ROI uses its cost.
    roi: (period === "all" ? committedCents : payCents) > 0 && broughtIn !== null ? broughtIn / ((period === "all" ? committedCents : payCents) / 100) : null,
    onboarding: h.onboarding ? { done: h.onboarding.done, total: h.onboarding.total } : undefined,
    videos,
    views,
    topVideo: top,
    topVideos,
    payouts,
    upcomingPayout,
    paidOutCents,
    installs: value ? value.customers : null,
    rpiUsd: value?.perUserUsd ?? null,
    rpiGrossUsd: value?.grossPerUserUsd ?? null,
    cpiUsd: value && value.customers > 0 ? payCents / 100 / value.customers : null,
    countryGroups,
  };
}

/**
 * The program's 5 most-viewed videos in the period, across every creator. Each
 * row already holds that creator's top 5, so the overall top 5 is among them.
 * Rows cached before topVideos existed contribute nothing.
 */
export function programTopVideos(rows: FounderCreatorRow[]): TopVideo[] {
  const all = rows.flatMap((r) => (r.topVideos ?? []).map((v) => ({ ...v, creatorId: r.id, creatorName: r.name })));
  return topByViews(all, TOP_VIDEOS);
}

/**
 * The whole creator program for a period: installs from every creator's link
 * (RevenueCat), PPI (7-day proceeds per install), RPI (gross) and CPI (total
 * creator cost / installs). Null fields when RevenueCat didn't answer.
 */
export async function programValue(period: string, rows: FounderCreatorRow[]) {
  const tags = [...new Set(rows.flatMap((r) => r.campaignTags))];
  const cost = rows.reduce((a, r) => a + r.payCents, 0) / 100;
  if (!tags.length) return { installs: null, ppiUsd: null, rpiUsd: null, cpiUsd: null, incomplete: false };
  const [from, to] = period === "all" ? [0, Date.now() + DAY_MS] : monthWindow(period);
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  try {
    const v = await rcValuePerUser(clampStart(day(from)), day(Math.min(to - DAY_MS, Date.now())), [{ name: "attribution_campaign", values: tags }]);
    return {
      installs: v.customers,
      ppiUsd: v.perUserUsd,
      rpiUsd: v.grossPerUserUsd,
      cpiUsd: v.customers > 0 ? cost / v.customers : null,
      incomplete: v.incomplete,
    };
  } catch (e) {
    console.error("program value:", e instanceof Error ? e.message : e);
    return { installs: null, ppiUsd: null, rpiUsd: null, cpiUsd: null, incomplete: false };
  }
}
