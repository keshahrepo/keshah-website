/**
 * The founder app's Home for a period (a month or all time): views on creator
 * videos, signups / trials / paid, revenue and proceeds, what creators cost,
 * and net profit after creators. Revenue also splits into users who came
 * through a creator's link and everyone else (organic, ads, untracked), which
 * is why the creators' "brought in" is only part of total revenue.
 *
 * Revenue comes from the RevenueCat webhook's per-payment records
 * (Users/{uid}/RevenueEvents), which start on 30 Sep 2026.
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION } from "@/lib/creators/db";
import { cachedCohort } from "./app-cohort";
import { founderCreators } from "./creators";

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
  /** Proceeds from users who came through any creator's link, and from everyone else. */
  fromCreatorsUsd: number;
  otherUsd: number;
  revenueTrackedFrom: string;
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

  let revenue = 0;
  let proceeds = 0;
  let payments = 0;
  const byUser = new Map<string, number>();
  for (const e of events.docs) {
    const x = e.data();
    if (x.environment === "SANDBOX") continue;
    const at = typeof x.purchased_at_ms === "number" ? x.purchased_at_ms : (x.recorded_at?.toMillis?.() ?? 0);
    if (at < from || at >= to) continue;
    revenue += Number(x.revenue_usd) || 0;
    const p = Number(x.proceeds_usd) || 0;
    proceeds += p;
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
    otherUsd: round(proceeds - fromCreators),
    revenueTrackedFrom: REVENUE_TRACKED_FROM,
  };
}
