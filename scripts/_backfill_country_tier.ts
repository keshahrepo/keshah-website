// Backfill: write `country_tier` on every existing user doc, computed
// from `userLocalTimeZone`. Tier-1 countries listed below match
// AppConsts.kEligibleCountryTimezones in the mobile app — keep the two
// lists in sync when the country list changes.
//
// Idempotent: skips docs that already have `country_tier` set. Missing
// timezone → defaults to tier_2 (safer default; matches mobile getter).
//
// After this runs, the newly-shipping build's isTier1Country getter
// reads a real value on every legacy account, so India / tier-2 users
// stop seeing Aadi's US-hours onboarding call prompt + regrowth CTA.
//
// Usage:
//   set -a; source .env.local; set +a
//   npx tsx scripts/_backfill_country_tier.ts            # dry run
//   npx tsx scripts/_backfill_country_tier.ts --apply    # write

import { getFirebaseAdmin } from "../lib/firebase-admin";

// Source of truth is mobile AppConsts.kEligibleCountryTimezones. Keep
// in sync: US, Canada, UK, Ireland, Australia, NZ, Germany, Netherlands,
// Sweden, Denmark, Norway, Switzerland, Austria, Belgium, Finland,
// France, Singapore, UAE, Hong Kong, Kuwait, Qatar, Saudi Arabia.
const TIER_1_TIMEZONES = new Set<string>([
  // US
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
  // Canada
  "America/St_Johns", "America/Halifax", "America/Glace_Bay",
  "America/Moncton", "America/Goose_Bay", "America/Toronto",
  "America/Nipigon", "America/Thunder_Bay", "America/Iqaluit",
  "America/Pangnirtung", "America/Atikokan", "America/Winnipeg",
  "America/Rainy_River", "America/Resolute", "America/Rankin_Inlet",
  "America/Regina", "America/Swift_Current", "America/Edmonton",
  "America/Cambridge_Bay", "America/Yellowknife", "America/Inuvik",
  "America/Creston", "America/Dawson_Creek", "America/Fort_Nelson",
  "America/Vancouver", "America/Whitehorse", "America/Dawson",
  // UK + Ireland
  "Europe/London", "Europe/Dublin",
  // Australia
  "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane",
  "Australia/Perth", "Australia/Adelaide", "Australia/Hobart",
  "Australia/Darwin", "Australia/Broken_Hill", "Australia/Currie",
  "Australia/Eucla", "Australia/Lindeman", "Australia/Lord_Howe",
  // New Zealand
  "Pacific/Auckland", "Pacific/Chatham",
  // Europe tier-1
  "Europe/Berlin", "Europe/Amsterdam", "Europe/Stockholm",
  "Europe/Copenhagen", "Europe/Oslo", "Europe/Zurich",
  "Europe/Vienna", "Europe/Brussels", "Europe/Helsinki",
  "Europe/Paris",
  // Singapore, GCC, HK
  "Asia/Singapore", "Asia/Dubai", "Asia/Hong_Kong",
  "Asia/Kuwait", "Asia/Qatar", "Asia/Riyadh",
]);

function computeTier(tz: string | undefined | null): "tier_1" | "tier_2" {
  if (!tz) return "tier_2";
  return TIER_1_TIMEZONES.has(tz) ? "tier_1" : "tier_2";
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { db } = getFirebaseAdmin();

  console.log(`Mode: ${apply ? "APPLY (writes)" : "DRY RUN"}\n`);

  let scanned = 0;
  let alreadySet = 0;
  let willWriteTier1 = 0;
  let willWriteTier2 = 0;
  let batchCount = 0;
  let batch = db.batch();

  const snap = await db
    .collection("Users")
    .select("userLocalTimeZone", "country_tier")
    .get();

  for (const doc of snap.docs) {
    scanned++;
    const d = doc.data();
    if (d.country_tier === "tier_1" || d.country_tier === "tier_2") {
      alreadySet++;
      continue;
    }
    const tz = d.userLocalTimeZone as string | undefined;
    const tier = computeTier(tz);
    if (tier === "tier_1") willWriteTier1++;
    else willWriteTier2++;

    if (apply) {
      batch.set(doc.ref, { country_tier: tier }, { merge: true });
      batchCount++;
      // Commit every 400 to stay under Firestore's 500-op batch cap.
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (apply && batchCount > 0) await batch.commit();

  console.log(`Scanned:               ${scanned.toLocaleString()}`);
  console.log(`Already set:           ${alreadySet.toLocaleString()}`);
  console.log(`Would write tier_1:    ${willWriteTier1.toLocaleString()}`);
  console.log(`Would write tier_2:    ${willWriteTier2.toLocaleString()}`);
  console.log(`Total to write:        ${(willWriteTier1 + willWriteTier2).toLocaleString()}`);
  if (!apply)
    console.log("\nDry run — re-run with `--apply` to commit writes.");
  else
    console.log("\n✓ Backfill complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
