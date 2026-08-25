import { getFirebaseAdmin } from "../lib/firebase-admin";

async function main() {
  const { db } = getFirebaseAdmin();

  // 1. Test114 doc — most likely to have hit the new writes.
  const t = await db.collection("Users").where("email", "==", "test114@test.com").limit(1).get();
  if (!t.empty) {
    const d = t.docs[0].data();
    console.log(`test114@test.com  (${t.docs[0].id})`);
    console.log(`  founder_story_started_at:      ${fmt(d.founder_story_started_at)}`);
    console.log(`  pinch_test_started_at:         ${fmt(d.pinch_test_started_at)}`);
    console.log(`  results_screenshots_started_at:${fmt(d.results_screenshots_started_at)}`);
    console.log(`  paywall_viewed_at:             ${fmt(d.paywall_viewed_at)}`);
    console.log(`  started_trial:                 ${d.started_trial ? "SET" : "-"}`);
  } else {
    console.log("test114 not found");
  }

  // 2. Any user with founder_story_started_at set at all
  console.log(`\n── Anyone with the new fields set? ──`);
  for (const f of ["founder_story_started_at","pinch_test_started_at","results_screenshots_started_at","paywall_viewed_at"]) {
    const s = await db.collection("Users").where(f, "!=", null).limit(5).get();
    console.log(`  ${f}: ${s.size} users (top 5 sampled)`);
    for (const doc of s.docs) console.log(`    - ${doc.data().email ?? doc.id}: ${fmt(doc.data()[f])}`);
  }
}

function fmt(v: unknown): string {
  if (!v) return "MISSING";
  const d = (v as { toDate?: () => Date }).toDate?.();
  return d ? d.toISOString() : String(v);
}

main().catch((e) => { console.error(e); process.exit(1); });
