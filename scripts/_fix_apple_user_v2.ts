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
  // App parser (DashBoardBloc.convertToDateFormatNullable) splits start_date.date
  // by "/" and expects dd/MM/yyyy. My earlier backfill wrote ISO "2026-05-21"
  // which crashed the parser → userDay fell back to -1 → blank dashboard.
  // Anchor to today (2026-05-23) in user's CDT timezone so they start on Day 1
  // — losing the 2 prior "days" is fine since their progress map is empty.
  await d.ref.update({
    start_date: {
      date: "23/05/2026",
      time: "08:00 AM",
      timezone: "CDT",
      timeZoneOffsetInMins: -300,
    },
    free_stoppage_switched_at_date: "05/23/2026",
    modified_at: FieldValue.serverTimestamp(),
  });
  const fresh = (await d.ref.get()).data() as any;
  console.log("✓ updated", d.id);
  console.log("start_date:", JSON.stringify(fresh.start_date));
  console.log("free_stoppage_switched_at_date:", fresh.free_stoppage_switched_at_date);
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
