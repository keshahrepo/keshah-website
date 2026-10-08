/**
 * The founder app's KESHAH App tab: one cohort of signups, picked by period
 * (a month or all time) and version (a release window, or all), filtered by
 * gender, paid/organic, country and campaign. Everything is computed with
 * the web dashboard's own definitions (lib/dashboard/*), so the numbers match
 * the Trial and Onboarding pages for the same slice.
 */
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { MOBILE_RELEASES, getRelease, getReleaseWindow } from "@/lib/release-history";
import {
  DISPLAYED_DAYS,
  TRIAL_USER_FIELDS,
  computeMetrics,
  isTestEmail,
  toTrialUser,
  tsToMs,
  type CheckInStats,
  type TrialUser,
} from "@/lib/dashboard/trial-cohort";
import { FUNNEL_FIELDS, FUNNEL_STAGES, IS_NEW_BUILD_USER } from "@/lib/dashboard/onboarding-funnel";
import { matchesInstallSource } from "@/app/dashboard/(main)/_lib/installSource";
import { matchesCountryFilter, type CountryFilter } from "@/app/dashboard/(main)/_lib/countryFilter";
import { normalizeCampaignName } from "@/app/dashboard/(main)/_lib/campaign";
import { CREATORS_COLLECTION } from "@/lib/creators/db";
import { rcValueByCountry, rcValuePerUser, type CountryValue } from "@/lib/revenue";

export interface CohortQuery {
  period: string; // "all" | "yyyy-mm"
  release: string; // "all" | release slug
  gender: "all" | "male" | "female";
  source: "all" | "paid" | "organic";
  country: CountryFilter;
  campaign: string; // "all" | campaign / creator name
}

export function parseCohortQuery(q: URLSearchParams): CohortQuery {
  const period = /^\d{4}-\d{2}$/.test(q.get("period") ?? "") ? q.get("period")! : "all";
  const release = q.get("release") && getRelease(q.get("release")) ? q.get("release")! : "all";
  const g = q.get("g");
  const s = q.get("s");
  const c = q.get("c");
  return {
    period,
    release,
    gender: g === "male" || g === "female" ? g : "all",
    source: s === "paid" || s === "organic" ? s : "all",
    country: c === "tier_1" || c === "tier_2" || c === "us" || c === "india" ? c : "all",
    campaign: (q.get("camp") ?? "all").trim() || "all",
  };
}

export function cohortKey(q: CohortQuery): string {
  return [q.period, q.release, q.gender, q.source, q.country, q.campaign].join("|").replace(/[^A-Za-z0-9|_-]/g, "_");
}

const FIRST_DATA = Date.UTC(2026, 1, 1); // Feb 2026: earliest signups the dashboards use

function window(q: CohortQuery): { from: number; to: number } | null {
  let from = FIRST_DATA;
  let to = Date.now();
  if (q.period !== "all") {
    const [y, m] = q.period.split("-").map(Number);
    from = Math.max(from, Date.UTC(y, m - 1, 1));
    to = Math.min(to, Date.UTC(y, m, 1));
  }
  if (q.release !== "all") {
    const w = getReleaseWindow(q.release, MOBILE_RELEASES);
    if (!w) return null;
    from = Math.max(from, w.from.getTime());
    to = Math.min(to, w.to.getTime());
  }
  return from < to ? { from, to } : null;
}

/** Campaign tag -> creator name, from every creator's campaign_tags (so new creators appear on their own). */
async function campaignNames(): Promise<Map<string, string>> {
  const snap = await getFirebaseAdmin().db.collection(CREATORS_COLLECTION).select("name", "legal_name", "campaign_tags").get();
  const map = new Map<string, string>();
  for (const d of snap.docs) {
    const name = String(d.get("name") || d.get("legal_name") || "").trim().split(/\s+/)[0];
    for (const t of (d.get("campaign_tags") as string[] | undefined) ?? []) if (name && t) map.set(t.trim().toLowerCase(), name);
  }
  return map;
}

export interface CohortResult {
  query: CohortQuery;
  from: string | null;
  to: string | null;
  releases: { slug: string; label: string; date: string | null }[];
  campaigns: { name: string; count: number }[];
  signups: number;
  trials: number;
  paid: number;
  revenueUsd: number;
  proceedsUsd: number;
  mature: number;
  matureConverted: number;
  stillInTrial: number;
  onboarding: { key: string; label: string; count: number }[];
  perDay: { day: number; done: number; eligible: number }[];
  day1: { distribution: number[]; neverOpened: number; maxTotal: number };
  checkIn3: CheckInStats;
  checkIn6: CheckInStats;
  alarm: { completed: number; skipped: number };
  /**
   * What a new user in this slice is worth in their first 14 days (RevenueCat
   * proceeds per new customer), and the same for the period just before.
   * Null with valueNote when RevenueCat can't apply a filter or didn't answer.
   */
  value14: { perUserUsd: number | null; grossPerUserUsd: number | null; customers: number; incomplete: boolean } | null;
  value14Prev: number | null;
  valueNote?: string;
  /** Installs and PPI by first country (RevenueCat), same slice. Null when RevenueCat can't apply a filter. */
  countries: CountryValue[] | null;
}

export async function cohort(q: CohortQuery): Promise<CohortResult> {
  const releases = MOBILE_RELEASES.filter((r) => !r.slug.startsWith("all_time")).map((r) => ({ slug: r.slug, label: r.label, date: r.date }));
  const w = window(q);
  const names = await campaignNames();
  const campOf = (raw: unknown): string | null => {
    if (typeof raw !== "string" || !raw.trim()) return null;
    return names.get(raw.trim().toLowerCase()) ?? normalizeCampaignName(raw);
  };
  const empty: CohortResult = {
    query: q,
    from: w ? new Date(w.from).toISOString() : null,
    to: w ? new Date(w.to).toISOString() : null,
    releases,
    campaigns: [],
    signups: 0,
    trials: 0,
    paid: 0,
    revenueUsd: 0,
    proceedsUsd: 0,
    mature: 0,
    matureConverted: 0,
    stillInTrial: 0,
    onboarding: FUNNEL_STAGES.map((s) => ({ key: s.key, label: s.label, count: 0 })),
    perDay: DISPLAYED_DAYS.map((day) => ({ day, done: 0, eligible: 0 })),
    day1: { distribution: [], neverOpened: 0, maxTotal: 0 },
    checkIn3: { total: 0, rows: {} as CheckInStats["rows"] },
    checkIn6: { total: 0, rows: {} as CheckInStats["rows"] },
    alarm: { completed: 0, skipped: 0 },
    value14: null,
    value14Prev: null,
    countries: null,
  };
  if (!w) return empty;
  const value = valueFor(q, w, names);

  const snap = await getFirebaseAdmin()
    .db.collection("Users")
    .where("created_at", ">=", Timestamp.fromMillis(w.from))
    .where("created_at", "<", Timestamp.fromMillis(w.to))
    .select(
      ...new Set<string>([
        ...TRIAL_USER_FIELDS,
        ...FUNNEL_FIELDS,
        "install_source",
        "country_tier",
        "userLocalTimeZone",
        "attribution_campaign",
        "alarm_walkthrough_outcome",
      ]),
    )
    .get();

  const users: TrialUser[] = [];
  const funnel: Record<string, number> = Object.fromEntries(FUNNEL_STAGES.map((s) => [s.key, 0]));
  const campCounts = new Map<string, number>();
  let signups = 0;
  let alarmCompleted = 0;
  let alarmSkipped = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (isTestEmail(d.email)) continue;
    const gender = d.selected_gender as string | undefined;
    if (q.gender !== "all" && gender !== q.gender) continue;
    if (!matchesInstallSource(q.source, d)) continue;
    if (!matchesCountryFilter(q.country, d)) continue;
    const camp = campOf(d.attribution_campaign);
    if (camp) campCounts.set(camp, (campCounts.get(camp) ?? 0) + 1);
    if (q.campaign !== "all" && (camp ?? "").toLowerCase() !== q.campaign.toLowerCase()) continue;
    const createdMs = tsToMs(d.created_at);
    if (createdMs === null) continue;
    signups++;
    if (IS_NEW_BUILD_USER(d)) for (const s of FUNNEL_STAGES) if (s.check(d)) funnel[s.key]++;
    if (d.alarm_walkthrough_outcome === "completed") alarmCompleted++;
    else if (d.alarm_walkthrough_outcome === "skipped") alarmSkipped++;
    if (d.started_trial) users.push(toTrialUser(d, createdMs, gender));
  }

  const m = computeMetrics(users, signups, Date.now());
  const v = await value;
  return {
    ...empty,
    ...v,
    campaigns: [...campCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, count]) => ({ name, count })),
    signups,
    trials: m.total,
    paid: m.outcomes.converted,
    revenueUsd: Math.round(m.revenueUsd * 100) / 100,
    proceedsUsd: Math.round(m.proceedsUsd * 100) / 100,
    mature: m.outcomes.mature,
    matureConverted: m.outcomes.matureConverted,
    stillInTrial: m.outcomes.stillInTrial,
    onboarding: FUNNEL_STAGES.map((s) => ({ key: s.key, label: s.label, count: funnel[s.key] })),
    perDay: DISPLAYED_DAYS.map((day) => ({ day, done: m.perDayCounts[day - 1] ?? 0, eligible: m.perDayEligible[day - 1] ?? 0 })),
    day1: { distribution: m.day1Distribution, neverOpened: m.day1NeverOpened, maxTotal: m.day1MaxTotal },
    checkIn3: m.checkIn3,
    checkIn6: m.checkIn6,
    alarm: { completed: alarmCompleted, skipped: alarmSkipped },
  };
}

/** cohort() through a Firestore cache: 15 min while the window is open, 6 h once closed. */
export async function cachedCohort(q: CohortQuery, opts: { fresh?: boolean } = {}): Promise<CohortResult & { computed_at?: string }> {
  const ref = getFirebaseAdmin().db.collection("DashboardMetrics").doc(`founder_cohort_v5_${cohortKey(q)}`.slice(0, 1400));
  if (!opts.fresh) {
    const snap = await ref.get();
    if (snap.exists) {
      const at = Date.parse(String(snap.get("computed_at") ?? ""));
      const closed = snap.get("closed") === true;
      if (Number.isFinite(at) && Date.now() - at < (closed ? 6 * 3600_000 : 15 * 60_000)) {
        return { ...JSON.parse(String(snap.get("json"))), computed_at: snap.get("computed_at") };
      }
    }
  }
  const out = await cohort(q);
  const computed_at = new Date().toISOString();
  const closed = !!out.to && Date.parse(out.to) < Date.now() - 9 * 86_400_000;
  await ref.set({ json: JSON.stringify(out), computed_at, closed }).catch((e) => console.error("cohort cache write failed:", e));
  return { ...out, computed_at };
}

/** RevenueCat's 14-day value per new user for the slice, plus the previous equal-length window. */
async function valueFor(q: CohortQuery, w: { from: number; to: number }, names: Map<string, string>) {
  if (q.gender !== "all") return { value14: null, value14Prev: null, countries: null, valueNote: "RevenueCat can't split value by gender" };
  if (q.source !== "all") return { value14: null, value14Prev: null, countries: null, valueNote: "RevenueCat can't split value by paid vs organic" };
  const filters: { name: string; values: string[] }[] = [];
  if (q.country === "us") filters.push({ name: "first_country", values: ["US"] });
  else if (q.country === "india") filters.push({ name: "first_country", values: ["IN"] });
  else if (q.country !== "all") return { value14: null, value14Prev: null, countries: null, valueNote: "RevenueCat can't split value by country tier" };
  if (q.campaign !== "all") {
    // A creator's name stands for all of their campaign tags.
    const tags = [...names.entries()].filter(([, n]) => n.toLowerCase() === q.campaign.toLowerCase()).map(([t]) => t);
    const raw = await getFirebaseAdmin().db.collection(CREATORS_COLLECTION).select("campaign_tags").get();
    const exact = raw.docs.flatMap((d) => ((d.get("campaign_tags") as string[] | undefined) ?? []).filter((t) => tags.includes(t.trim().toLowerCase())));
    filters.push({ name: "attribution_campaign", values: exact.length ? exact : [q.campaign] });
  }
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const end = Math.min(w.to, Date.now());
  const len = end - w.from;
  try {
    const [cur, prev, countries] = await Promise.all([
      rcValuePerUser(day(w.from), day(end - 86_400_000), filters),
      len > 0 ? rcValuePerUser(day(w.from - len), day(w.from - 86_400_000), filters).catch(() => null) : Promise.resolve(null),
      rcValueByCountry(day(w.from), day(end - 86_400_000), filters).catch((e) => {
        console.error("cohort countries:", e instanceof Error ? e.message : e);
        return null;
      }),
    ]);
    return {
      value14: { perUserUsd: cur.perUserUsd, grossPerUserUsd: cur.grossPerUserUsd, customers: cur.customers, incomplete: cur.incomplete },
      value14Prev: prev?.perUserUsd ?? null,
      countries,
    };
  } catch (e) {
    console.error("cohort value per user:", e instanceof Error ? e.message : e);
    return { value14: null, value14Prev: null, countries: null, valueNote: "RevenueCat didn't answer" };
  }
}

