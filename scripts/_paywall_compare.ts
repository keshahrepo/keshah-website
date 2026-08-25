// Compare trial-start rate: pre-+162 cohort (Aug 11-17) vs
// post-+162 cohort (Aug 18-19). Uses `converted_at` as the trial-start
// signal since it's been written by both old and new paywalls. Filters
// test accounts.

import { getFirebaseAdmin } from "../lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

const TEST = /^test\d+@test\.com$/i;

interface Window {
  label: string;
  from: Date;
  to: Date;
}

const WINDOWS: Window[] = [
  { label: "Pre-+162 (Aug 11-17)", from: new Date("2026-08-11T00:00:00Z"), to: new Date("2026-08-18T00:00:00Z") },
  { label: "Post-+162 (Aug 18-19)", from: new Date("2026-08-18T00:00:00Z"), to: new Date("2026-08-20T00:00:00Z") },
];

async function main() {
  const { db } = getFirebaseAdmin();

  for (const w of WINDOWS) {
    const snap = await db
      .collection("Users")
      .where("created_at", ">=", Timestamp.fromDate(w.from))
      .where("created_at", "<", Timestamp.fromDate(w.to))
      .select("email", "converted_at", "started_trial", "country_tier", "userLocalTimeZone")
      .get();

    let total = 0, converted = 0;
    let tier1 = 0, tier1Conv = 0;
    let tier2 = 0, tier2Conv = 0;

    for (const doc of snap.docs) {
      const d = doc.data();
      if (TEST.test(d.email ?? "")) continue;
      total++;
      const hasStart = !!d.converted_at || !!d.started_trial;
      if (hasStart) converted++;

      // Country_tier only backfilled for post-Aug-18 users. For pre-
      // window, infer from timezone using the same rule.
      const tz = d.userLocalTimeZone as string | undefined;
      const tier = d.country_tier as string | undefined;
      const isT1 = tier === "tier_1" ||
        (!tier && !!tz && /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Detroit|Anchorage|Honolulu|Toronto|Vancouver|Edmonton|Halifax)|Europe\/(London|Dublin|Berlin|Amsterdam|Stockholm|Copenhagen|Oslo|Zurich|Vienna|Brussels|Helsinki|Paris)|Australia\/|Pacific\/(Auckland|Chatham|Honolulu)|Asia\/(Singapore|Dubai|Hong_Kong|Kuwait|Qatar|Riyadh))/.test(tz));
      if (isT1) { tier1++; if (hasStart) tier1Conv++; }
      else { tier2++; if (hasStart) tier2Conv++; }
    }

    const rate = (n: number, d: number) => (d === 0 ? "n/a" : ((n / d) * 100).toFixed(1) + "%");
    console.log(`\n═══ ${w.label} ═══`);
    console.log(`  Signups (excl. test):  ${total}`);
    console.log(`  Trial started:         ${converted}   ${rate(converted, total)}`);
    console.log(`  Tier-1:                ${tier1Conv}/${tier1}   ${rate(tier1Conv, tier1)}`);
    console.log(`  Tier-2:                ${tier2Conv}/${tier2}   ${rate(tier2Conv, tier2)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
