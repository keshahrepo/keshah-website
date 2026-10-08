/**
 * The founder app's Home for a period (a month or all time): views on creator
 * videos, signups / trials / paid, revenue and proceeds, what creators cost,
 * and net profit after creators.
 *
 * Every money figure is RevenueCat's own: revenue and proceeds from
 * metrics/revenue, and the creator split from the revenue chart segmented by
 * attribution campaign (the campaign each creator's link sets). Nothing is
 * estimated: if RevenueCat doesn't answer, the money fields are missing.
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION } from "@/lib/creators/db";
import { rcRevenue, rcRevenueByCampaign } from "@/lib/revenue";
import { cachedCohort } from "./app-cohort";
import { founderCreators } from "./creators";

export interface FounderSummary {
  period: string;
  views: number;
  videos: number;
  signups: number;
  trials: number;
  paid: number;
  revenueUsd: number;
  proceedsUsd: number;
  /** Cost of the period's creator work (base + bonuses its videos earned), see lib/founder/creators.ts. */
  creatorCostUsd: number;
  netUsd: number;
  /** RevenueCat proceeds from creators' campaigns, and everything else. */
  fromCreatorsUsd: number;
  otherUsd: number;
  /** Set when RevenueCat didn't answer: money fields are then missing, not guessed. */
  revenueError?: string;
}

const DAY_MS = 86_400_000;

function window(period: string): [number, number] {
  if (period === "all") return [0, Date.now() + DAY_MS];
  const [y, m] = period.split("-").map(Number);
  return [Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1)];
}

export async function founderSummary(period: string): Promise<FounderSummary> {
  const db = getFirebaseAdmin().db;
  const [from, to] = window(period);
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const startDate = period === "all" ? "2020-01-01" : day(from);
  const endDate = day(Math.min(to - DAY_MS, Date.now()));

  const [cohortRes, creators, creatorDocs] = await Promise.all([
    cachedCohort({ period, release: "all", gender: "all", source: "all", country: "all", campaign: "all" }),
    founderCreators(period),
    db.collection(CREATORS_COLLECTION).select("campaign_tags").get(),
  ]);
  const tags = new Set<string>();
  for (const d of creatorDocs.docs) for (const t of (d.get("campaign_tags") as string[] | undefined) ?? []) if (t) tags.add(t.trim().toLowerCase());

  let money: { revenue: number; proceeds: number; fromCreators: number } | null = null;
  let revenueError: string | undefined;
  try {
    const [revenue, proceeds, byCampaign] = await Promise.all([
      rcRevenue(startDate, endDate, "revenue"),
      rcRevenue(startDate, endDate, "proceeds"),
      rcRevenueByCampaign(startDate, endDate, "proceeds"),
    ]);
    let fromCreators = 0;
    for (const [name, v] of byCampaign) if (tags.has(name.trim().toLowerCase())) fromCreators += v;
    money = { revenue, proceeds, fromCreators };
  } catch (e) {
    revenueError = e instanceof Error ? e.message : String(e);
    console.error("founder summary revenue:", revenueError);
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const cost = creators.reduce((a, r) => a + r.payCents, 0) / 100;
  const proceeds = money?.proceeds ?? 0;
  return {
    period,
    views: creators.reduce((a, r) => a + r.views, 0),
    videos: creators.reduce((a, r) => a + r.videos, 0),
    signups: cohortRes.signups,
    trials: cohortRes.trials,
    paid: cohortRes.paid,
    revenueUsd: round(money?.revenue ?? 0),
    proceedsUsd: round(proceeds),
    creatorCostUsd: round(cost),
    netUsd: round(proceeds - cost),
    fromCreatorsUsd: round(money?.fromCreators ?? 0),
    otherUsd: round(Math.max(0, proceeds - (money?.fromCreators ?? 0))),
    ...(revenueError ? { revenueError } : {}),
  };
}
