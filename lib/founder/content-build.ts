/**
 * Pure builders for GET /api/founder/content (contract: Content page).
 * Loading lives in ./content.ts.
 */
import type { ContentScript } from "@/lib/creators/content";
import { familyRollups, risingFamilies, scanItems, tally, type LibVideo, type ScanItem } from "@/lib/creators/content-select";
import type { IdeaTest, IdeaTestResult } from "@/lib/creators/proven";
import { ALL_TIME_START } from "./start";

export const GOAL_VIEWS = 200_000_000;
export const TRENDING_TOP = 15;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** month=yyyy-mm|all -> local_date window [from, to) and a label. Anything else = this month (UTC). */
export function periodWindow(month: string | null, now = new Date()): { key: string; label: string; from: string; to: string | null } {
  if (month === "all") return { key: "all", label: "All time", from: ALL_TIME_START, to: null };
  const m = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : now.toISOString().slice(0, 7);
  const [y, mm] = m.split("-").map(Number);
  const next = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  return { key: m, label: `${MONTHS[mm - 1]} ${y}`, from: `${m}-01`, to: `${next}-01` };
}

export interface PostRow {
  creator_id: string;
  url: string;
  views: number;
}

export function hits(posts: { views: number }[]) {
  return {
    hits_100k: posts.filter((p) => p.views >= 100_000).length,
    hits_500k: posts.filter((p) => p.views >= 500_000).length,
    hits_1m: posts.filter((p) => p.views >= 1_000_000).length,
  };
}

/** Period block. new_script_share = views on remakes of founder ideas / all views (null when there are no views or no idea remakes are known). */
export function buildPeriod(label: string, posts: PostRow[] | null, ideaRemakeUrls: Set<string> | null) {
  if (!posts) return { label, views: null, hits_100k: 0, hits_500k: 0, hits_1m: 0, new_script_share: null };
  const views = posts.reduce((a, p) => a + p.views, 0);
  const fromIdeas = ideaRemakeUrls ? posts.filter((p) => ideaRemakeUrls.has(p.url)).reduce((a, p) => a + p.views, 0) : 0;
  return { label, views, ...hits(posts), new_script_share: views > 0 && ideaRemakeUrls && ideaRemakeUrls.size ? fromIdeas / views : null };
}

export type TestResultKey = "won" | "dropped" | "running" | "borderline";
export const resultKey = (r: IdeaTestResult | undefined): TestResultKey =>
  r === "promoted" ? "won" : r === "dropped" ? "dropped" : r === "borderline" ? "borderline" : "running";

export interface IdeaInfo {
  test_result?: IdeaTestResult;
  test?: IdeaTest;
  assignments: string[];
}

export interface TestRow {
  id: string;
  title: string;
  hook: string;
  format: string;
  source: string;
  creators: string[];
  views_3d: number | null;
  views_7d: number | null;
  views: number | null;
  result: TestResultKey;
}

const maxOf = (xs: (number | null | undefined)[]) => {
  const n = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return n.length ? Math.max(...n) : null;
};

export function testRow(s: ContentScript, idea: IdeaInfo | undefined, names: Map<string, string>): TestRow {
  const rs = idea?.test?.remakes ?? [];
  const who = [...new Set([...rs.map((r) => r.creator_id), ...(idea?.assignments ?? [])])];
  return {
    id: s.id,
    title: s.title,
    hook: s.hook,
    format: s.format,
    source: s.source,
    creators: who.map((id) => names.get(id) ?? id),
    views_3d: maxOf(rs.map((r) => r.views_3d)),
    views_7d: maxOf(rs.map((r) => r.views_7d)),
    views: idea?.test?.best_views ?? maxOf(rs.map((r) => r.views)),
    result: resultKey(idea?.test_result),
  };
}

const counts = (rows: TestRow[]) => ({
  tested: rows.length,
  won: rows.filter((r) => r.result === "won").length,
  dropped: rows.filter((r) => r.result === "dropped").length,
  running: rows.filter((r) => r.result === "running").length,
});

/** Tests block: approved scripts with an idea, by week (newest first). */
export function buildTests(scripts: ContentScript[], ideas: Map<string, IdeaInfo>, names: Map<string, string>) {
  const tested = scripts.filter((s) => s.status === "approved" && s.idea_id);
  const rows = tested.map((s) => ({ week: s.week_of, slot: s.slot, row: testRow(s, ideas.get(s.idea_id!), names) }));
  const all = rows.map((r) => r.row);
  const c = counts(all);
  const judged = all.filter((r) => r.result !== "running").length;
  const weeks = [...new Set(rows.map((r) => r.week))].sort().reverse().map((week_of) => {
    const list = rows.filter((r) => r.week === week_of).sort((a, b) => a.slot - b.slot).map((r) => r.row);
    return { week_of, ...counts(list), scripts: list };
  });
  return {
    ...c,
    win_rate: judged ? c.won / judged : null,
    by_format: tally(all, (r) => r.format, (r) => r.result === "won"),
    by_source: tally(all, (r) => r.source, (r) => r.result === "won"),
    weeks,
    best: [...all].filter((r) => r.views != null).sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 10),
  };
}

/** Library block: active videos by stored format, tired flags, rising families. */
export function buildLibrary(videos: LibVideo[], today: string) {
  const active = videos.filter((v) => v.status === "active");
  const byFormat = new Map<string, number>();
  for (const v of active) byFormat.set(v.format ?? "other", (byFormat.get(v.format ?? "other") ?? 0) + 1);
  const hook = (v: LibVideo) => v.hook_full || v.hook_line;
  return {
    total: active.length,
    by_format: [...byFormat].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    tired: active.filter((v) => v.tired?.flagged).map((v) => ({ id: v.id, hook: hook(v), family: v.hook_family ?? "" })),
    rising: risingFamilies(familyRollups(videos, today)).map((f) => ({ id: f.top.id, hook: f.top.hook, family: f.family })),
  };
}

/** Trending block: the latest scan's top items; adapted = a script already references it. */
export function buildTrending(scan: { finished_at: string | null; id: string; items: Parameters<typeof scanItems>[0] } | null, adaptedUrls: Set<string>) {
  if (!scan) return { scanned_at: null, videos: [] };
  return {
    scanned_at: scan.finished_at ?? scan.id,
    videos: scanItems(scan.items).slice(0, TRENDING_TOP).map((v: ScanItem) => ({
      url: v.url,
      handle: v.handle,
      platform: v.platform,
      niche: v.niche,
      views: v.views || 0,
      hook: (v.transcript?.trim() || v.caption || "").split(/(?<=[.!?])\s/)[0].slice(0, 200),
      cover: v.cover_mirror || v.cover || null,
      adapted: adaptedUrls.has(v.url),
    })),
  };
}

/** Trials per 1,000 views: null when trials or views aren't known (never estimated). */
export const trialsPer1k = (trials: number | null, views: number | null): number | null =>
  trials == null || views == null || views <= 0 ? null : (trials / views) * 1000;
