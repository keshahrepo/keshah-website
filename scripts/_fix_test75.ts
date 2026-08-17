import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const AUTH_UID = "6A2cSuaVtVUYHDMNHMqNrcOuAXs2";
const DOC_FOUND = "wLsYT1QWp0e3fhGDoUkM";

(async () => {
  // Check both doc paths
  for (const id of [AUTH_UID, DOC_FOUND]) {
    const d = await db.collection("Users").doc(id).get();
    console.log(`\nUsers/${id} — exists=${d.exists}`);
    if (d.exists) {
      const x = d.data() as any;
      console.log(`  email: ${x.email}`);
      console.log(`  treatment_stage: ${x.treatment_stage}`);
      console.log(`  progress keys: ${Object.keys(x.progress || {}).sort().join(", ")}`);
    }
  }

  // Delete progress.day1 on both so they regenerate with new videos
  for (const id of [AUTH_UID, DOC_FOUND]) {
    const d = await db.collection("Users").doc(id).get();
    if (!d.exists) continue;
    await db.collection("Users").doc(id).update({
      "progress.day1": FieldValue.delete(),
    });
    console.log(`\n✓ Deleted progress.day1 on Users/${id}`);
  }
  console.log(`\nDashboard will regenerate day1 on next open — with the new videos.`);
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
