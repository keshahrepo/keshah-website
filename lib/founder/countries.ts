/**
 * Country breakdown for the founder app, all from RevenueCat:
 *   installs + 7-day proceeds by first country (LTV per customer chart),
 *   trial starts / conversions / pending by country (trial conversion chart).
 * Grouped the way the KESHAH app tiers users (kEligibleCountryTimezones in
 * KESHAH-Mobile-App lib/core/app_consts.dart): US, India, the rest of Tier 1,
 * and Tier 2 (everyone else).
 */
import { rcChart, rcChartOptions } from "@/lib/revenue";

/** Tier 1 countries, exactly as the KESHAH app's kEligibleCountryTimezones keys. */
export const TIER_1 = new Set(["US", "CA", "GB", "IE", "AU", "NZ", "DE", "NL", "SE", "DK", "NO", "CH", "AT", "BE", "FI", "FR", "SG", "AE", "HK", "KW", "QA", "SA"]);

export type GroupKey = "us" | "tier_1" | "tier_2" | "india";

export interface CountryStats {
  code: string;
  name: string;
  installs: number;
  proceedsUsd: number;
  trialStarts: number;
  conversions: number;
  /** Trials that have converted or expired (pending ones aren't counted yet). */
  finished: number;
}

export interface CountryRow extends CountryStats {
  /** Share of all installs in the slice. */
  share: number;
  trialStartRate: number | null;
  trialToPaid: number | null;
  ppiUsd: number | null;
}

export interface CountryGroup extends CountryRow {
  key: GroupKey;
  /** Countries inside the group (Tier 1 / Tier 2), biggest first. */
  countries: CountryRow[];
}

export function groupOf(code: string): GroupKey {
  if (code === "US") return "us";
  if (code === "IN") return "india";
  return TIER_1.has(code) ? "tier_1" : "tier_2";
}

const LABEL: Record<GroupKey, string> = { us: "US", tier_1: "Tier 1", tier_2: "Tier 2", india: "India" };

type Filter = { name: string; values: string[] };

function totals(o: Record<string, unknown>): { measures: string[]; total: Record<string, Record<string, number>> } {
  const measures = ((o.measures as Array<Record<string, unknown>> | undefined) ?? []).map((m) => String(m.display_name ?? ""));
  const total = ((o.summary as Record<string, unknown> | undefined)?.total ?? {}) as Record<string, Record<string, number>>;
  return { measures, total };
}

/** Per-country stats for customers who started in [startDate, endDate], with optional RevenueCat filters. */
export async function countryStats(startDate: string, endDate: string, filters: Filter[] = []): Promise<CountryStats[]> {
  const common = { resolution: "2", start_date: startDate, end_date: endDate, currency: "USD", limit_num_segments: "300" };
  const f: Record<string, string> = filters.length ? { filters: JSON.stringify(filters) } : {};
  const [ltv, tcr, opts] = await Promise.all([
    rcChart("ltv_per_customer", { ...common, ...f, segment: "first_country", selectors: JSON.stringify({ customer_lifetime: "7_days" }) }),
    rcChart("trial_conversion_rate", { ...common, ...f, segment: "country" }),
    rcChartOptions("trial_conversion_rate"),
  ]);
  // Country name -> ISO code (RevenueCat segments come back by display name).
  const codeOf = new Map<string, string>();
  for (const fl of (opts.filters as Array<Record<string, unknown>> | undefined) ?? []) {
    if (fl.id !== "country") continue;
    for (const o of (fl.options as Array<Record<string, unknown>> | undefined) ?? []) codeOf.set(String(o.display_name), String(o.id));
  }
  const by = new Map<string, CountryStats>();
  const get = (name: string) => {
    let c = by.get(name);
    if (!c) {
      c = { code: codeOf.get(name) ?? name, name, installs: 0, proceedsUsd: 0, trialStarts: 0, conversions: 0, finished: 0 };
      by.set(name, c);
    }
    return c;
  };
  const l = totals(ltv);
  const custKey = l.measures.find((m) => /new customers/i.test(m));
  const procKey = l.measures.find((m) => /realized proceeds/i.test(m));
  if (!custKey || !procKey) throw new Error("RevenueCat LTV chart missing measures");
  for (const [name, m] of Object.entries(l.total)) {
    if (name === "Total") continue;
    const c = get(name);
    c.installs += Number(m[custKey] ?? 0);
    c.proceedsUsd += Number(m[procKey] ?? 0);
  }
  const t = totals(tcr);
  for (const [name, m] of Object.entries(t.total)) {
    if (name === "Total") continue;
    const c = get(name);
    const starts = Number(m["Trial Starts"] ?? 0);
    const pending = Number(m["Pending"] ?? 0);
    c.trialStarts += starts;
    c.conversions += Number(m["Conversions"] ?? 0);
    c.finished += Math.max(0, starts - pending);
  }
  // Blank / "Unknown" country segments aren't a country: leave them out.
  return [...by.values()].filter((c) => c.name.trim() && c.code !== "unknown" && !/^unknown$/i.test(c.name));
}

function row(c: CountryStats, allInstalls: number): CountryRow {
  return {
    ...c,
    proceedsUsd: Math.round(c.proceedsUsd * 100) / 100,
    share: allInstalls > 0 ? c.installs / allInstalls : 0,
    trialStartRate: c.installs > 0 ? c.trialStarts / c.installs : null,
    trialToPaid: c.finished > 0 ? c.conversions / c.finished : null,
    ppiUsd: c.installs > 0 ? c.proceedsUsd / c.installs : null,
  };
}

/** The four groups (US, Tier 1, Tier 2, India) with their countries. */
export function groupCountries(stats: CountryStats[]): CountryGroup[] {
  const all = stats.reduce((a, c) => a + c.installs, 0);
  const groups: CountryGroup[] = [];
  for (const key of ["us", "tier_1", "tier_2", "india"] as GroupKey[]) {
    const members = stats.filter((c) => groupOf(c.code) === key && (c.installs > 0 || c.trialStarts > 0));
    const sum: CountryStats = members.reduce(
      (a, c) => ({ ...a, installs: a.installs + c.installs, proceedsUsd: a.proceedsUsd + c.proceedsUsd, trialStarts: a.trialStarts + c.trialStarts, conversions: a.conversions + c.conversions, finished: a.finished + c.finished }),
      { code: key, name: LABEL[key], installs: 0, proceedsUsd: 0, trialStarts: 0, conversions: 0, finished: 0 },
    );
    groups.push({
      ...row(sum, all),
      key,
      countries: key === "tier_1" || key === "tier_2" ? members.map((c) => row(c, all)).sort((a, b) => b.installs - a.installs) : [],
    });
  }
  return groups;
}
