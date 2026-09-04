// Flip side of _paid_days_completed.ts: bucket every signup by how
// many trial days they completed (any task OR fully), then compute
// paid rate per bucket. Answers "does engagement predict paid
// conversion?" — leading-indicator view.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const TEST_EMAIL = /^test\d+@test\.com$/i;
const COHORT_FROM = new Date("2026-08-18T00:00:00Z");
const COHORT_TO = new Date(Date.now() - 10 * 86_400_000);

// Trimmed US timezone set — mirrors app/dashboard/(main)/_lib/countryFilter.ts
const US_TIMEZONES = new Set<string>([
  "America/New_York", "America/Detroit", "America/Kentucky/Louisville",
  "America/Kentucky/Monticello", "America/Indiana/Indianapolis",
  "America/Indiana/Vincennes", "America/Indiana/Winamac",
  "America/Indiana/Marengo", "America/Indiana/Petersburg",
  "America/Indiana/Vevay", "America/Chicago", "America/Indiana/Tell_City",
  "America/Indiana/Knox", "America/Menominee", "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem", "America/North_Dakota/Beulah",
  "America/Denver", "America/Boise", "America/Phoenix", "America/Los_Angeles",
  "America/Anchorage", "America/Juneau", "America/Sitka", "America/Metlakatla",
  "America/Yakutat", "America/Nome", "America/Adak", "Pacific/Honolulu",
  "EST", "EDT", "CST", "CDT", "MST", "MDT", "PST", "PDT",
]);

type Filter = "all" | "tier_1" | "us";
function matches(filter: Filter, u: any): boolean {
  if (filter === "all") return true;
  if (filter === "tier_1") return u.country_tier === "tier_1";
  if (filter === "us") {
    const tz = u.userLocalTimeZone as string | undefined;
    return !!tz && US_TIMEZONES.has(tz);
  }
  return true;
}

(async () => {
  const snap = await db.collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(COHORT_FROM))
    .where("created_at", "<=", Timestamp.fromDate(COHORT_TO))
    .get();

  interface U { paid: boolean; anyDone: number; allDone: number; raw: any }
  const rawUsers: U[] = [];
  for (const d of snap.docs) {
    const u:any = d.data();
    if (u.is_deleted) continue;
    if (typeof u.email === "string" && TEST_EMAIL.test(u.email)) continue;
    if (u.started_trial == null) continue;
    const paid = u.converted_trial != null;
    const progress = u.progress ?? {};
    let anyDone = 0, allDone = 0;
    for (let day = 1; day <= 7; day++) {
      const dayList = progress[`day${day}`];
      if (!Array.isArray(dayList) || dayList.length === 0) continue;
      const c = dayList.filter((e:any) => e?.is_completed === true).length;
      if (c > 0) anyDone++;
      if (c === dayList.length) allDone++;
    }
    rawUsers.push({ paid, anyDone, allDone, raw: u });
  }

  const runFilter = (filter: Filter, label: string) => {
    const users = rawUsers.filter(u => matches(filter, u.raw));
    console.log(`\n══════════════════════════════════════════════════════`);
    console.log(`  ${label} (n=${users.length})`);
    console.log(`══════════════════════════════════════════════════════`);
    if (!users.length) { console.log("  (no users match)"); return; }
    const totalPaid = users.filter(u => u.paid).length;
    const baseRate = totalPaid / users.length;
    console.log(`  Trial starters: ${users.length}   Paid: ${totalPaid}   Base: ${(baseRate*100).toFixed(2)}%\n`);
    console.log(`  days   users  paid   rate    Δ vs base`);
    const buckets: Record<number, { n: number; paid: number }> = {};
    for (const u of users) {
      const k = u.anyDone;
      if (!buckets[k]) buckets[k] = { n: 0, paid: 0 };
      buckets[k].n++;
      if (u.paid) buckets[k].paid++;
    }
    for (let d = 0; d <= 7; d++) {
      const b = buckets[d] ?? { n: 0, paid: 0 };
      const rate = b.n ? b.paid / b.n : 0;
      const delta = rate - baseRate;
      const arrow = delta >= 0 ? "↑" : "↓";
      const bar = "█".repeat(Math.round(rate * 40));
      console.log(`  ${d}     ${String(b.n).padStart(4)}   ${String(b.paid).padStart(3)}   ${(rate*100).toFixed(1).padStart(5)}%  ${arrow}${(delta*100).toFixed(1).padStart(5)}pp  ${bar}`);
    }
  };

  runFilter("all", "ALL COUNTRIES");
  runFilter("tier_1", "TIER 1 ONLY");
  runFilter("us", "US ONLY");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
