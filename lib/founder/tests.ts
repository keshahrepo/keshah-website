/**
 * Tests: every deliberate change across KESHAH that should move one metric,
 * with an automatic before / after. Firestore `Tests` (started fresh
 * 2026-10-23, separate from the pipeline backlog). Only user-facing changes
 * with a measurable metric and a start date belong here.
 *
 * Before = the `window` days before the start; after = from the start, up to
 * `window` days (yesterday at most, today is still filling). A verdict comes
 * only when the after side has enough data; until then it's "too early".
 *
 * Metrics measured automatically:
 *   per1k    installs per 1,000 views for an account ("creators" = the creator
 *            program, "all" = Aadi + creators), from Stats/installs_per_1k
 *   organic  organic installs per day, from Stats/installs_daily (+ history)
 *   ppi      7-day proceeds per install (RevenueCat), for an account's tags,
 *            the creator program, or everyone ("all")
 *   manual   no automatic numbers (the result is written by hand)
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { rcValuePerUser } from "@/lib/revenue";
import { PER_1K_DOC, sumDays, type AccountDays } from "./installs-per-1k";

export const TESTS_COLLECTION = "Tests";
export type Metric = "per1k" | "organic" | "ppi" | "manual";
export const METRICS: Metric[] = ["per1k", "organic", "ppi", "manual"];

export type Side = { value: number | null; views?: number; installs?: number; days: number; from: string; to: string };
export type Verdict = "better" | "worse" | "no_change" | "too_early" | "manual";
export type Result = { before: Side | null; after: Side | null; change: number | null; verdict: Verdict; note: string };

export type TestDoc = {
  title: string;
  area: string; // "content" | "app" | "paywall" | ...
  metric: Metric;
  scope: string; // account id, "creators" or "all"
  started_on: string; // yyyy-mm-dd
  window_days: number;
  ended_on?: string | null;
  status?: "running" | "stopped";
  notes?: string;
  manual_result?: string;
};

const DAY = 86400000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => ymd(Date.parse(d + "T00:00:00Z") + n * DAY);

/** Before and after windows for a test, clipped to yesterday (and to ended_on). */
export function windows(t: Pick<TestDoc, "started_on" | "window_days" | "ended_on">, now = new Date()) {
  const n = Math.max(3, Math.min(60, t.window_days || 14));
  const yesterday = ymd(now.getTime() - DAY);
  const before = { from: addDays(t.started_on, -n), to: addDays(t.started_on, -1) };
  let afterTo = addDays(t.started_on, n - 1);
  if (t.ended_on && t.ended_on < afterTo) afterTo = t.ended_on;
  if (yesterday < afterTo) afterTo = yesterday;
  const after = afterTo >= t.started_on ? { from: t.started_on, to: afterTo } : null;
  return { n, before, after };
}

export const daysIn = (w: { from: string; to: string }) => Math.round((Date.parse(w.to) - Date.parse(w.from)) / DAY) + 1;

/** Shared verdict rule: a 15%+ move with enough data on the after side. */
export function judge(before: number | null, after: number | null, enough: boolean, higherIsBetter = true): { change: number | null; verdict: Verdict } {
  if (before === null || after === null || before === 0) return { change: null, verdict: "too_early" };
  const change = after / before - 1;
  if (!enough) return { change, verdict: "too_early" };
  if (Math.abs(change) < 0.15) return { change, verdict: "no_change" };
  return { change, verdict: (change > 0) === higherIsBetter ? "better" : "worse" };
}

/** Installs per 1,000 views for a scope over a window. */
export function per1kFor(accounts: AccountDays[], scope: string, w: { from: string; to: string }): Side {
  const pick = accounts.filter((a) => !a.noTag && (scope === "all" ? true : scope === "creators" ? !a.isAadi : a.id === scope));
  let views = 0;
  let installs = 0;
  for (const a of pick) {
    const s = sumDays(a, w.from, w.to);
    views += s.views;
    installs += s.installs;
  }
  return { value: views > 0 ? (installs / views) * 1000 : null, views, installs, days: daysIn(w), ...w };
}

export const MIN_VIEWS = 1_000_000;

export function per1kResult(accounts: AccountDays[], t: TestDoc, now = new Date()): Result {
  const { before: bw, after: aw } = windows(t, now);
  if (!aw) return { before: per1kFor(accounts, t.scope, bw), after: null, change: null, verdict: "too_early", note: "Starts " + t.started_on };
  const before = per1kFor(accounts, t.scope, bw);
  const after = per1kFor(accounts, t.scope, aw);
  const enough = (after.views ?? 0) >= MIN_VIEWS && (before.views ?? 0) >= MIN_VIEWS;
  const j = judge(before.value, after.value, enough);
  const note = enough ? "" : `Needs ${compact(MIN_VIEWS)}+ views on each side (after: ${compact(after.views ?? 0)})`;
  return { before, after, ...j, note };
}

/** Organic installs per day over a window, from { date: organic }. */
export function organicFor(byDay: Map<string, number>, w: { from: string; to: string }): Side {
  let sum = 0;
  let days = 0;
  for (let d = w.from; d <= w.to; d = addDays(d, 1)) {
    const v = byDay.get(d);
    if (v === undefined) continue;
    sum += v;
    days++;
  }
  return { value: days ? sum / days : null, installs: sum, days, ...w };
}

export function organicResult(byDay: Map<string, number>, t: TestDoc, now = new Date()): Result {
  const { before: bw, after: aw } = windows(t, now);
  const before = organicFor(byDay, bw);
  if (!aw) return { before, after: null, change: null, verdict: "too_early", note: "Starts " + t.started_on };
  const after = organicFor(byDay, aw);
  const enough = after.days >= 7 && before.days >= 7;
  return { before, after, ...judge(before.value, after.value, enough), note: enough ? "" : "Needs 7+ days after the start" };
}

function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

// ---------------------------------------------------------------- Firestore + RevenueCat

async function tagsFor(scope: string): Promise<string[] | null> {
  if (scope === "all") return null; // everyone, no filter
  const db = getFirebaseAdmin().db;
  const docs = scope === "creators" ? (await db.collection("ContentCreators").get()).docs : [await db.collection("ContentCreators").doc(scope).get()];
  const tags = docs
    .filter((d) => d.exists && (scope !== "creators" || d.get("exclude_from_reports") !== true))
    .flatMap((d) => ((d.get("campaign_tags") as string[] | undefined) ?? []).map(String));
  return tags;
}

async function ppiResult(t: TestDoc, now = new Date()): Promise<Result> {
  const { before: bw, after: aw } = windows(t, now);
  const tags = await tagsFor(t.scope);
  if (tags && !tags.length) return { before: null, after: null, change: null, verdict: "too_early", note: "No campaign tag for this scope" };
  const filters = tags ? [{ name: "attribution_campaign", values: tags }] : [];
  const side = async (w: { from: string; to: string }): Promise<Side & { incomplete: boolean }> => {
    const v = await rcValuePerUser(w.from, w.to, filters);
    return { value: v.perUserUsd, installs: v.customers, days: daysIn(w), ...w, incomplete: v.incomplete };
  };
  const before = await side(bw);
  if (!aw) return { before, after: null, change: null, verdict: "too_early", note: "Starts " + t.started_on };
  const after = await side(aw);
  // PPI needs each install's first 7 days, so the after side matures a week late.
  const enough = after.days >= 7 && !after.incomplete;
  return { before, after, ...judge(before.value, after.value, enough), note: enough ? "" : "PPI fills in 7 days after each install" };
}

export async function computeResult(t: TestDoc, now = new Date()): Promise<Result> {
  if (t.metric === "manual") return { before: null, after: null, change: null, verdict: "manual", note: t.manual_result ?? "" };
  const db = getFirebaseAdmin().db;
  if (t.metric === "per1k") {
    const d = (await db.collection("Stats").doc(PER_1K_DOC).get()).data();
    return per1kResult((d?.accounts as AccountDays[] | undefined) ?? [], t, now);
  }
  if (t.metric === "organic") {
    const [hist, daily] = await Promise.all([db.collection("Stats").doc("installs_history").get(), db.collection("Stats").doc("installs_daily").get()]);
    const byDay = new Map<string, number>();
    for (const doc of [hist, daily])
      for (const x of ((doc.data()?.days as { date: string; organic: number | null }[] | undefined) ?? []))
        if (typeof x.organic === "number" && !(x as { partial?: boolean }).partial) byDay.set(x.date, x.organic);
    return organicResult(byDay, t, now);
  }
  return ppiResult(t, now);
}

/** Human label for a scope: "Isai Trujillo", "Creators", "Everyone". */
export async function scopeName(scope: string): Promise<string> {
  if (scope === "all") return "Everyone";
  if (scope === "creators") return "Creators";
  const d = await getFirebaseAdmin().db.collection("ContentCreators").doc(scope).get();
  return d.get("founder_account") === true ? "Your account" : String(d.get("name") ?? scope);
}
