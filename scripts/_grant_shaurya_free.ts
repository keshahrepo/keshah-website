import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const APPLY = process.argv.includes("--apply");
(async () => {
  const snap = await db.collection("Users").where("email", "==", "grovershaurya1508@gmail.com").get();
  if (snap.empty) { console.error("no user with that email"); process.exit(1); }
  const doc = snap.docs[0];
  const cur:any = doc.data();
  console.log("uid:", doc.id);
  console.log("current:");
  console.log("  user_type:", cur.user_type);
  console.log("  pro:", cur.pro);
  console.log("  open_account:", cur.open_account);
  console.log("  treatment_stage:", cur.treatment_stage);
  console.log("  extra_user_tags:", cur.extra_user_tags);
  console.log("  start_date:", JSON.stringify(cur.start_date));

  const update = { open_account: true, pro: true };
  console.log("\nwill set:", JSON.stringify(update));
  if (!APPLY) { console.log("[dry] --apply to write"); process.exit(0); }
  await doc.ref.update(update);
  console.log("✓ granted");
})();
