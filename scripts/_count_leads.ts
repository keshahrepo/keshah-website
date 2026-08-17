import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const now = Date.now();
  const since14 = new Date(now - 14 * 86_400_000);
  const since2 = new Date(now - 2 * 86_400_000);
  const since2hr = new Date(now - 2 * 3_600_000);

  // Total in 14d window
  const all = await db.collection("Users").where("nurture_started_at", ">=", since14).count().get();
  console.log("Total leads in 14d:", all.data().count);

  // Recent <2 days (these need day1 timed sends)
  const recent = await db.collection("Users").where("nurture_started_at", ">=", since2).count().get();
  console.log("Leads <2 days old:", recent.data().count);

  // Very recent <2 hours (definitely need day1 sends)
  const veryRecent = await db.collection("Users").where("nurture_started_at", ">=", since2hr).count().get();
  console.log("Leads <2 hours old:", veryRecent.data().count);

  // With nurture_completed false/unset in 14d
  const active = await db.collection("Users")
    .where("nurture_started_at", ">=", since14)
    .orderBy("nurture_started_at", "asc")
    .limit(1)
    .get();
  if (active.docs.length) {
    const oldest = active.docs[0].data().nurture_started_at?.toDate?.();
    console.log("Oldest active lead:", oldest?.toISOString());
  }

  // Where is the 500th doc when ordered ASC?
  const sample = await db.collection("Users")
    .where("nurture_started_at", ">=", since14)
    .orderBy("nurture_started_at", "asc")
    .limit(500)
    .offset(499)
    .get();
  if (sample.docs.length) {
    const cutoff = sample.docs[0].data().nurture_started_at?.toDate?.();
    console.log("500th lead's nurture_started_at:", cutoff?.toISOString());
    console.log("→ Everything newer than this is SKIPPED by current batch cap");
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
