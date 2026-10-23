/**
 * Installs and views by day, for the founder app's chart. Hourly (cron
 * /api/cron/installs-daily) it reads RevenueCat's new customers per day split
 * by attribution campaign, buckets them into Aadi's account (its campaign
 * tags), creators' links and everything else (organic: app store, untagged),
 * adds that day's views from every tracked account's posts, and saves it to
 * Stats/installs_daily. GET /api/founder/installs-views serves it.
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { rcChart } from "@/lib/revenue";

export const INSTALLS_DAYS = 45;
export const STATS_DOC = "installs_daily";

export interface InstallsDay {
  date: string;
  installs: number | null;
  aadi: number | null;
  creators: number | null;
  organic: number | null;
  views: number;
  /** Today (UTC) is still filling up. */
  partial?: boolean;
}

type Json = Record<string, unknown>;

/** RevenueCat's chart -> { date: { segmentName: count } } (defensive about the shape). */
export function parseDailyBySegment(o: Json): Map<string, Map<string, number>> {
  const segments = ((o.segments as Json[] | undefined) ?? []).map((s) => String(s.display_name ?? s.id ?? ""));
  const values = (o.values as Json[] | undefined) ?? [];
  const out = new Map<string, Map<string, number>>();
  for (const v of values) {
    const raw = v.cohort ?? v.date ?? v.timestamp;
    const ms = typeof raw === "number" ? (raw < 1e12 ? raw * 1000 : raw) : Date.parse(String(raw));
    if (!Number.isFinite(ms)) continue;
    const date = new Date(ms).toISOString().slice(0, 10);
    const segIdx = typeof v.segment === "number" ? v.segment : -1;
    const seg = segIdx >= 0 ? segments[segIdx] ?? `#${segIdx}` : String(v.segment ?? "Total");
    if (typeof v.measure === "number" && v.measure !== 0) continue;
    const val = Number(v.value ?? 0);
    if (!out.has(date)) out.set(date, new Map());
    out.get(date)!.set(seg, (out.get(date)!.get(seg) ?? 0) + (Number.isFinite(val) ? val : 0));
  }
  return out;
}

export function bucketDay(segs: Map<string, number>, aadiTags: Set<string>, creatorTags: Set<string>): { installs: number; aadi: number; creators: number; organic: number } {
  let total = 0;
  let aadi = 0;
  let creators = 0;
  const totalRow = segs.get("Total");
  for (const [name, n] of segs) {
    if (name === "Total") continue;
    total += n;
    if (aadiTags.has(name)) aadi += n;
    else if (creatorTags.has(name)) creators += n;
  }
  const installs = typeof totalRow === "number" && totalRow >= total ? totalRow : total;
  return { installs, aadi, creators, organic: Math.max(0, installs - aadi - creators) };
}

export async function refreshInstallsDaily(now = new Date()): Promise<{ days: number; error?: string }> {
  const { db } = getFirebaseAdmin();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - (INSTALLS_DAYS - 1) * 86400000).toISOString().slice(0, 10);
  const creators = await db.collection("ContentCreators").get();
  const aadiTags = new Set<string>();
  const creatorTags = new Set<string>();
  const views = new Map<string, number>();
  for (const c of creators.docs) {
    const d = c.data();
    const tags: string[] = Array.isArray(d.campaign_tags) ? d.campaign_tags.map(String) : [];
    const isAadi = /^aadi$/i.test(String(d.name ?? "").trim());
    tags.forEach((t) => (isAadi ? aadiTags : creatorTags).add(t));
    const posts = await c.ref.collection("posts").where("local_date", ">=", start).select("local_date", "views", "pinned").get();
    posts.docs.forEach((p) => {
      const x = p.data();
      if (x.pinned) return;
      views.set(String(x.local_date), (views.get(String(x.local_date)) ?? 0) + Number(x.views ?? 0));
    });
  }
  let byDay = new Map<string, Map<string, number>>();
  let error: string | undefined;
  try {
    const o = await rcChart("customers_new", { resolution: "0", start_date: start, end_date: end, segment: "attribution_campaign" });
    byDay = parseDailyBySegment(o);
    if (!byDay.size) error = `no rows; keys ${Object.keys(o).join(",")}; sample ${JSON.stringify((o.values as unknown[] | undefined)?.slice(0, 2) ?? null).slice(0, 300)}`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const days: InstallsDay[] = [];
  for (let t = new Date(start + "T00:00:00Z").getTime(); t <= Date.parse(end + "T00:00:00Z"); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const segs = byDay.get(date);
    const b = segs ? bucketDay(segs, aadiTags, creatorTags) : null;
    days.push({ date, installs: b?.installs ?? null, aadi: b?.aadi ?? null, creators: b?.creators ?? null, organic: b?.organic ?? null, views: views.get(date) ?? 0, ...(date === end ? { partial: true } : {}) });
  }
  // Per campaign tag per day (e.g. "Isai TikTok" vs "Isai Insta"), to spot a bio link that isn't the tracked one.
  const tagged = [...aadiTags, ...creatorTags];
  const by_tag: Record<string, Record<string, number>> = {};
  for (const [date, segs] of byDay) {
    for (const t of tagged) {
      const n = segs.get(t);
      if (n) (by_tag[t] ??= {})[date] = n;
    }
  }
  await db.collection("Stats").doc(STATS_DOC).set({ days, by_tag, updated_at: now.toISOString(), aadi_tags: [...aadiTags], error: error ?? null });
  return { days: days.length, ...(error ? { error } : {}) };
}

/** One-off look back: Aadi-tag installs per day from `from` (e.g. "2026-07-01") into Stats/installs_history. */
export async function backfillAadiInstalls(from: string, now = new Date()): Promise<{ days: number; error?: string }> {
  const { db } = getFirebaseAdmin();
  const end = now.toISOString().slice(0, 10);
  const creators = await db.collection("ContentCreators").get();
  const aadiTags = new Set<string>();
  const creatorTags = new Set<string>();
  creators.docs.forEach((c) => {
    const d = c.data();
    const tags: string[] = Array.isArray(d.campaign_tags) ? d.campaign_tags.map(String) : [];
    tags.forEach((t) => (/^aadi$/i.test(String(d.name ?? "").trim()) ? aadiTags : creatorTags).add(t));
  });
  try {
    const o = await rcChart("customers_new", { resolution: "0", start_date: from, end_date: end, segment: "attribution_campaign" });
    const byDay = parseDailyBySegment(o);
    const days = [...byDay.keys()].sort().map((date) => ({ date, ...bucketDay(byDay.get(date)!, aadiTags, creatorTags) }));
    await db.collection("Stats").doc("installs_history").set({ from, days, updated_at: now.toISOString() });
    return { days: days.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.collection("Stats").doc("installs_history").set({ from, error, updated_at: now.toISOString() });
    return { days: 0, error };
  }
}
