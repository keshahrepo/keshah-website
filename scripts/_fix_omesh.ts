// Backfill missing start_date for lomesh.rai@gmail.com so his calendar renders.
// Runs in DRY mode unless APPLY=1.
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const APPLY = process.env.APPLY === "1";
const UID = "bn9rNdMr0gc923xLFDGoG9JWkgo2";
const EMAIL = "lomesh.rai@gmail.com";

// Today in IST as "DD/MM/YYYY" and "HH:MM AM/PM"
const now = new Date();
// Get IST components (UTC + 5:30)
const ist = new Date(now.getTime() + 330 * 60 * 1000);
const dd = String(ist.getUTCDate()).padStart(2, "0");
const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
const yyyy = ist.getUTCFullYear();
let h = ist.getUTCHours();
const min = String(ist.getUTCMinutes()).padStart(2, "0");
const ampm = h >= 12 ? "PM" : "AM";
h = h % 12 || 12;
const timeStr = `${String(h).padStart(2, "0")}:${min} ${ampm}`;

const start_date = {
  date: `${dd}/${mm}/${yyyy}`,
  timeZoneOffsetInMins: 330,
  timezone: "IST",
  time: timeStr,
};

(async () => {
  const ref = db.collection("Users").doc(UID);
  const snap = await ref.get();
  if (!snap.exists) { console.log("Doc missing"); process.exit(1); }
  const x = snap.data() as any;
  console.log(`user: ${x.email} · ${x.user_type} · ${x.treatment_stage}`);
  console.log(`current start_date: ${JSON.stringify(x.start_date) || "MISSING"}`);
  console.log(`will set to:        ${JSON.stringify(start_date)}`);
  if (x.email !== EMAIL) { console.log("email mismatch — abort"); process.exit(1); }
  if (x.start_date) { console.log("already has start_date — nothing to do"); process.exit(0); }
  if (!APPLY) { console.log("\nDRY RUN. Re-run with APPLY=1 to write."); process.exit(0); }
  await ref.update({ start_date });
  console.log("✓ written.");
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
