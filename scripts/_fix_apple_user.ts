import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", "==", "zf9s8wy469@privaterelay.appleid.com").limit(1).get();
  if (snap.empty) { console.log("NOT FOUND"); process.exit(1); }
  const d = snap.docs[0];
  // Today in user's Chicago timezone (UTC-5, CDT). Format mirrors other
  // US users in Firestore (MM/DD/YYYY for the switched-at date, plus an
  // ISO date + time in the start_date map).
  await d.ref.update({
    start_date: {
      date: "2026-05-21",
      time: "12:00 PM",
      timezone: "CDT",
      timeZoneOffsetInMins: -300,
    },
    free_stoppage_switched_at_date: "05/21/2026",
    user_local_time_zone: "America/Chicago",
    modified_at: FieldValue.serverTimestamp(),
  });
  const fresh = (await d.ref.get()).data() as any;
  console.log("✓ updated", d.id);
  console.log("start_date:", JSON.stringify(fresh.start_date));
  console.log("free_stoppage_switched_at_date:", fresh.free_stoppage_switched_at_date);
  console.log("user_local_time_zone:", fresh.user_local_time_zone);
  console.log("treatment_stage:", fresh.treatment_stage);
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
