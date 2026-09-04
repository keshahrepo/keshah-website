import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const APPLY = process.argv.includes("--apply");
(async () => {
  const snap = await db.collection("Users").where("email", "==", "najinthant@gmail.com").get();
  if (snap.empty) { console.error("no user"); process.exit(1); }
  const doc = snap.docs[0];
  const cur:any = doc.data();
  console.log("uid:", doc.id);
  console.log("current treatment_stage:", cur.treatment_stage);
  console.log("current free_stoppage_switched_at_date:", cur.free_stoppage_switched_at_date);
  console.log("selected_gender:", cur.selected_gender, "· pro:", cur.pro);
  console.log("\nwill set treatment_stage → FREE_STOPPAGE_PLUS");
  if (!APPLY) { console.log("[dry] --apply to write"); process.exit(0); }
  await doc.ref.update({ treatment_stage: "FREE_STOPPAGE_PLUS" });
  console.log("✓ switched to Stop+");
})();
