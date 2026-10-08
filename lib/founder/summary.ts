/**
 * The founder app's Home for a period (a month or all time): views on creator
 * videos, signups / trials / paid, revenue and proceeds, what creators cost,
 * and net profit after creators. Revenue also splits into users who came
 * through a creator's link and everyone else (organic, ads, untracked), which
 * is why the creators' "brought in" is only part of total revenue.
 *
 * Revenue and proceeds are RevenueCat's own figures for the period
 * (metrics/revenue). The creator split uses the payments RevenueCat sent us
 * by webhook (Users/{uid}/RevenueEvents, recorded from 30 Sep 2026): real
 * amounts for users we can tie to a creator's link, nothing estimated.
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION } from "@/lib/creators/db";
import { cachedCohort } from "./app-cohort";
import { founderCreators } from "./creators";
import { rcRevenue } from "@/lib/revenue";

export const REVENUE_TRACKED_FROM = "2026-09-30";

export interface FounderSummary {
  period: string;
  views: number;
  videos: number;
  signups: number;
  trials: number;
  paid: number;
  revenueUsd: number;
  proceedsUsd: number;
  payments: number;
  creatorCostUsd: number;
  netUsd: number;
  /** Proceeds from users who came through any creator's link (recorded payments), and the rest. */
  fromCreatorsUsd: number;
  otherUsd: number;
  /** The creator split only counts payments recorded from this date. */
  splitTrackedFrom: string;
  /** Set when RevenueCat didn't answer: revenue / proceeds / net are then missing, not guessed. */
  revenueError?: string;
}

function window(period: string): [number, number] {
  if (period === "all") return [0, Date.now() + 86_400_000];
  const [y, m] = period.split("-").map(Number);
  return [Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1)];
}

export async function founderSummary(period: string): Promise<FounderSummary> {
  const db = getFirebaseAdmin().db;
  const [from, to] = window(period);
  const [cohortRes, creators, events, creatorDocs] = await Promise.all([
    cachedCohort({ period, release: "all", gender: "all", source: "all", country: "all", campaign: "all" }),
    founderCreators(period),
    db.collectionGroup("RevenueEvents").select("revenue_usd", "proceeds_usd", "purchased_at_ms", "environment", "recorded_at").get(),
    db.collection(CREATORS_COLLECTION).select("campaign_tags").get(),
  ]);

  const tags = new Set<string>();
  for (const d of creatorDocs.docs) for (const t of (d.get("campaign_tags") as string[] | undefined) ?? []) if (t) tags.add(t.trim().toLowerCase());

  // RevenueCat's own totals for the period (inclusive dates).
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const startDate = period === "all" ? "2020-01-01" : day(from);
  const endDate = day(Math.min(to - 86_400_000, Date.now()));
  let rcTotals: { revenue: number; proceeds: number } | null = null;
  let revenueError: string | undefined;
  try {
    const [r, p] = await Promise.all([rcRevenue(startDate, endDate, "revenue"), rcRevenue(startDate, endDate, "proceeds")]);
    rcTotals = { revenue: r, proceeds: p };
  } catch (e) {
    revenueError = e instanceof Error ? e.message : String(e);
    console.error("founder summary revenue:", revenueError);
  }

  let payments = 0;
  const byUser = new Map<string, number>();
  for (const e of events.docs) {
    const x = e.data();
    if (x.environment === "SANDBOX") continue;
    const at = typeof x.purchased_at_ms === "number" ? x.purchased_at_ms : (x.recorded_at?.toMillis?.() ?? 0);
    if (at < from || at >= to) continue;
    const p = Number(x.proceeds_usd) || 0;
    payments++;
    const uid = e.ref.parent.parent?.id;
    if (uid) byUser.set(uid, (byUser.get(uid) ?? 0) + p);
  }

  // Which paying users came through a creator's link.
  let fromCreators = 0;
  const uids = [...byUser.keys()];
  for (let k = 0; k < uids.length; k += 300) {
    const refs = uids.slice(k, k + 300).map((u) => db.collection("Users").doc(u));
    const snaps = await db.getAll(...refs, { fieldMask: ["attribution_campaign"] });
    for (const sn of snaps) {
      const camp = String(sn.get("attribution_campaign") ?? "").trim().toLowerCase();
      if (camp && tags.has(camp)) fromCreators += byUser.get(sn.id) ?? 0;
    }
  }

  const cost = creators.reduce((a, r) => a + r.payCents, 0) / 100;
  const round = (n: number) => Math.round(n * 100) / 100;
  const revenue = rcTotals?.revenue ?? 0;
  const proceeds = rcTotals?.proceeds ?? 0;
  return {
    period,
    views: creators.reduce((a, r) => a + r.views, 0),
    videos: creators.reduce((a, r) => a + r.videos, 0),
    signups: cohortRes.signups,
    trials: cohortRes.trials,
    paid: cohortRes.paid,
    revenueUsd: round(revenue),
    proceedsUsd: round(proceeds),
    payments,
    creatorCostUsd: round(cost),
    netUsd: round(proceeds - cost),
    fromCreatorsUsd: round(fromCreators),
    otherUsd: round(Math.max(0, proceeds - fromCreators)),
    splitTrackedFrom: REVENUE_TRACKED_FROM,
    ...(revenueError ? { revenueError } : {}),
  };
}
