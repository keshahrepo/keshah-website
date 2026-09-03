// One-shot: rewrite visitayaanmohan275@gmail.com's start_date into
// the format the mobile app can parse (dd/MM/yyyy + time + timezone).
// Doc currently has {date: "2026-08-30", time: "12:00"} — mobile parser
// expects "30/08/2026" / "12:00 PM" / timezone + offset, so userDay
// comes back null and the dashboard can't load tasks.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const APPLY = process.argv.includes("--apply");

(async () => {
  const snap = await db.collection("Users").where("email", "==", "visitayaanmohan275@gmail.com").get();
  if (snap.empty) { console.error("no user found"); process.exit(1); }
  const doc = snap.docs[0];
  const cur = doc.data() as any;

  // Reset him to Day 1 today (2026-09-03, IST). Also update the
  // stoppage-switched date so the stage transitions stay consistent,
  // and clear the (empty) `progress` field so nothing stale sticks.
  const fixed = {
    date: "03/09/2026",
    time: "12:00 PM",
    timezone: "IST",
    timeZoneOffsetInMins: 330,
  };

  console.log("uid:", doc.id);
  console.log("current start_date:", JSON.stringify(cur.start_date));
  console.log("new start_date:    ", JSON.stringify(fixed));
  console.log("free_stoppage_switched_at_date → 2026-09-03");

  if (!APPLY) {
    console.log("\n[dry] add --apply to write");
    process.exit(0);
  }

  await doc.ref.update({
    start_date: fixed,
    free_stoppage_switched_at_date: "2026-09-03",
    progress: {}, // wipe any stale progress so Day 1 seeds cleanly
  });
  console.log("\n✓ updated. On next app open, dashboard should populate progress.day1 automatically.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
