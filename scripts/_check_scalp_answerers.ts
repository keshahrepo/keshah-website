import { getFirebaseAdmin } from "../lib/firebase-admin";

async function main() {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection("Users")
    .where("scalp_check_answers", "!=", null)
    .select("email", "scalp_check_answers", "created_at", "user_type")
    .get();

  console.log(`Found ${snap.size} users with scalp_check_answers set\n`);
  for (const doc of snap.docs) {
    const d = doc.data();
    const created = d.created_at?.toDate?.()?.toISOString?.() ?? "?";
    const answers = d.scalp_check_answers ?? {};
    const isTest = /test\d+@test\.com/i.test(d.email ?? "");
    console.log(`  ${isTest ? "🧪 TEST" : "👤 REAL"}  ${d.email ?? doc.id}`);
    console.log(`         type=${d.user_type ?? "?"}  created=${created}`);
    console.log(`         answers = ${JSON.stringify(answers)}\n`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
