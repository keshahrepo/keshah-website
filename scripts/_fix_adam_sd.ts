// Rewrite Adam's malformed start_date with full timezone-aware object.
// Existing shape: { date: "29/07/2026", time: "" } — missing offset/timezone
// which breaks the app's day computation.
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const APPLY = process.env.APPLY === "1";
const UID = "9VDMxxEWKpRlaWcxcU4r";

// Dublin, July = Irish Summer Time = UTC+1 = 60 min offset
// Preserve existing calendar date (29/07/2026); backfill time to when he
// completed his first task (~10:55 Dublin) so the day-1 window aligns.
const start_date = {
  date: "29/07/2026",
  timeZoneOffsetInMins: 60,
  timezone: "IST",       // Irish Summer Time abbreviation
  time: "10:55 AM",
};

(async () => {
  const ref = db.collection("Users").doc(UID);
  const snap = await ref.get();
  if (!snap.exists) { console.log("Doc missing"); process.exit(1); }
  const x = snap.data() as any;
  console.log("current start_date:", JSON.stringify(x.start_date));
  console.log("will overwrite to: ", JSON.stringify(start_date));
  if (x.email !== "adamstrongts115a@gmail.com") { console.log("email mismatch"); process.exit(1); }
  if (!APPLY) { console.log("\nDRY RUN. Re-run with APPLY=1 to write."); process.exit(0); }
  await ref.update({ start_date });
  console.log("✓ written.");
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
