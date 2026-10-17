/**
 * GET /api/founder/content: the founder app's Content page (contract in
 * content-build.ts). Views come from ContentCreators/{id}/posts by local_date
 * (pinned posts and old handles left out, like the Creators tab); trials per
 * 1K views from attributionFor (RevenueCat-tagged users), null without a tag.
 */
import { CONTENT_FACTS } from "@/lib/creators/content-facts";
import { SCRIPTS_COLLECTION, toScript } from "@/lib/creators/content";
import { latestScan, loadLibrary, weekPayload } from "@/lib/creators/content-db";
import { attributionFor, db, listCreators } from "@/lib/creators/admin";
import { CREATORS_COLLECTION } from "@/lib/creators/db";
import { localDate } from "@/lib/creators/pay";
import { PROVEN_COLLECTION, addDaysTo } from "@/lib/creators/proven";
import { cached } from "./cache";
import { ALL_TIME_START_MS } from "./start";
import { GOAL_VIEWS, buildLibrary, buildPeriod, buildTests, buildTrending, hits, periodWindow, trialsPer1k, type IdeaInfo, type PostRow } from "./content-build";

/** The week the page shows: this week's Monday on weekdays, the coming Monday on weekends (drafted Saturday night). */
export function pageWeekOf(today: string): string {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  return dow === 0 ? addDaysTo(today, 1) : dow === 6 ? addDaysTo(today, 2) : addDaysTo(today, 1 - dow);
}

const norm = (h: unknown) => String(h ?? "").trim().replace(/^@/, "").toLowerCase();

/** Posts + trials per creator for the period (the slow part; cached like the Creators tab). */
async function periodData(month: string) {
  const w = periodWindow(month);
  const excluded = new Set((await db().collection(CREATORS_COLLECTION).where("exclude_from_reports", "==", true).select().get()).docs.map((d) => d.id));
  const creators = (await listCreators()).filter((c) => (c.pay_ready || c.legal_name) && !excluded.has(c.id));
  const fromMs = w.key === "all" ? ALL_TIME_START_MS : Date.parse(`${w.from}T00:00:00Z`);
  const toMs = w.to ? Date.parse(`${w.to}T00:00:00Z`) : Date.now() + 86_400_000;
  const rows = await Promise.all(
    creators.map(async (c) => {
      let q = db().collection(CREATORS_COLLECTION).doc(c.id).collection("posts").where("local_date", ">=", w.from);
      if (w.to) q = q.where("local_date", "<", w.to);
      const [snap, attr] = await Promise.all([
        q.select("platform", "url", "views", "handle", "pinned").get(),
        c.campaign_tags.length ? attributionFor(c.campaign_tags, fromMs, toMs).catch(() => null) : Promise.resolve(null),
      ]);
      const want: Record<string, string> = { tiktok: norm(c.tiktok_handle), instagram: norm(c.instagram_handle) };
      const posts: PostRow[] = [];
      for (const d of snap.docs) {
        const x = d.data();
        const h = want[String(x.platform)];
        if (x.pinned || (h && x.handle && norm(x.handle) !== h)) continue;
        posts.push({ creator_id: c.id, url: String(x.url ?? ""), views: Number(x.views ?? 0) || 0 });
      }
      return { id: c.id, name: c.name || c.legal_name, posts, trials: attr ? attr.trialsInWindow : null };
    }),
  );
  return { label: w.label, rows };
}

/** Post urls of every remake of a founder idea (new scripts). */
async function ideaRemakeUrls(): Promise<Set<string>> {
  const ideas = await db().collection(PROVEN_COLLECTION).where("added_by", "==", "founder_idea").select().get();
  const out = new Set<string>();
  await Promise.all(
    ideas.docs.map(async (d) => {
      const rs = await d.ref.collection("remakes").select("tiktok_url", "instagram_url").get();
      for (const r of rs.docs) for (const u of [r.get("tiktok_url"), r.get("instagram_url")]) if (typeof u === "string" && u) out.add(u);
    }),
  );
  return out;
}

export async function founderContent(month: string | null, opts: { fresh?: boolean; week_of?: string } = {}) {
  const w = periodWindow(month);
  const today = localDate(new Date().toISOString(), "America/New_York");
  const weekOf = opts.week_of && /^\d{4}-\d{2}-\d{2}$/.test(opts.week_of) ? opts.week_of : pageWeekOf(today);
  const [pd, urls, week, scriptsSnap, lib, scan] = await Promise.all([
    cached(`content_${w.key}`, w.key, () => periodData(w.key), { fresh: opts.fresh }),
    ideaRemakeUrls().catch(() => null),
    weekPayload(weekOf),
    db().collection(SCRIPTS_COLLECTION).get(),
    loadLibrary(),
    latestScan(),
  ]);
  const scripts = scriptsSnap.docs.map((d) => toScript(d.id, d.data()));
  const ideaIds = scripts.map((s) => s.idea_id).filter((x): x is string => !!x);
  const ideas = new Map<string, IdeaInfo>();
  for (let i = 0; i < ideaIds.length; i += 100) {
    const snaps = await db().getAll(...ideaIds.slice(i, i + 100).map((id) => db().collection(PROVEN_COLLECTION).doc(id)));
    for (const s of snaps) {
      if (!s.exists) continue;
      const a = (s.get("idea_assignments") ?? []) as { creator_id: string }[];
      ideas.set(s.id, { test_result: s.get("test_result"), test: s.get("test"), assignments: a.map((x) => x.creator_id) });
    }
  }
  const names = new Map(pd.rows.map((r) => [r.id, r.name]));
  const allPosts = pd.rows.flatMap((r) => r.posts);
  return {
    goal_views: GOAL_VIEWS,
    period: buildPeriod(pd.label, allPosts, urls),
    week,
    tests: buildTests(scripts, ideas, names),
    creators: pd.rows
      .map((r) => {
        const views = r.posts.reduce((a, p) => a + p.views, 0);
        const h = hits(r.posts);
        return { id: r.id, name: r.name, views, hits_100k: h.hits_100k, hits_500k: h.hits_500k, trials_per_1k: trialsPer1k(r.trials, views) };
      })
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0)),
    library: buildLibrary(lib, today),
    trending: buildTrending(scan, new Set(scripts.map((s) => s.reference?.url).filter((u): u is string => !!u))),
    facts: CONTENT_FACTS.map((f) => ({ id: f.id, line: f.line, source: f.source, never: f.never })),
    computed_at: pd.computed_at,
  };
}
