import { getFirebaseAdmin } from "../lib/firebase-admin";
async function main() {
  const { db } = getFirebaseAdmin();
  for (const f of ["founder_story_started_at","pinch_test_started_at","results_screenshots_started_at","paywall_viewed_at","started_trial","country_tier"]) {
    const c = await db.collection("Users").where(f, "!=", null).count().get();
    console.log(`  ${f.padEnd(35)} ${c.data().count.toLocaleString()}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
