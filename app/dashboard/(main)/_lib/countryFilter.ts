// Shared country filter primitives for the dashboard pages.
//
// `tier_1` / `tier_2` read the persisted `country_tier` field on the
// user doc (written by the mobile app based on IP + device country).
// `us` / `india` are timezone-based subsets: they match users whose
// `userLocalTimeZone` is in the listed sets. Timezone is more
// permissive than tier for these two individual countries since some
// tier_1 tags include multiple locales.

export type CountryFilter = "all" | "tier_1" | "tier_2" | "us" | "india";

export const COUNTRY_TABS: Array<{ id: CountryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "tier_1", label: "Tier 1" },
  { id: "tier_2", label: "Tier 2" },
  { id: "us", label: "US only" },
  { id: "india", label: "India only" },
];

export const US_TIMEZONES = new Set<string>([
  "America/New_York", "America/Detroit", "America/Kentucky/Louisville",
  "America/Kentucky/Monticello", "America/Indiana/Indianapolis",
  "America/Indiana/Vincennes", "America/Indiana/Winamac",
  "America/Indiana/Marengo", "America/Indiana/Petersburg",
  "America/Indiana/Vevay", "America/Chicago", "America/Indiana/Tell_City",
  "America/Indiana/Knox", "America/Menominee", "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem", "America/North_Dakota/Beulah",
  "America/Denver", "America/Boise", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "America/Juneau",
  "America/Sitka", "America/Metlakatla", "America/Yakutat",
  "America/Nome", "America/Adak", "Pacific/Honolulu",
]);

// Asia/Calcutta is the legacy alias for Asia/Kolkata; both are still
// reported by real user devices — include both so no India user gets
// missed by the filter.
export const INDIA_TIMEZONES = new Set<string>([
  "Asia/Kolkata", "Asia/Calcutta",
]);

export function matchesCountryFilter(
  filter: CountryFilter,
  d: Record<string, unknown>,
): boolean {
  if (filter === "all") return true;
  const tier = d.country_tier as string | undefined;
  const tz = d.userLocalTimeZone as string | undefined;
  if (filter === "tier_1") return tier === "tier_1";
  if (filter === "tier_2") return tier === "tier_2";
  if (filter === "us") return !!tz && US_TIMEZONES.has(tz);
  if (filter === "india") return !!tz && INDIA_TIMEZONES.has(tz);
  return true;
}

export function parseCountryFilter(raw: string | undefined): CountryFilter {
  if (raw === "tier_1" || raw === "tier_2" || raw === "us" || raw === "india") return raw;
  return "all";
}
