import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", "==", "pontiacgto202@gmail.com").limit(1).get();
  if (snap.empty) { console.log("NOT FOUND"); process.exit(1); }
  const d = snap.docs[0];
  await d.ref.update({
    // Transition to maintenance — free_maintenance_switched_at_date is
    // already set to 09/11/2025 (Sept 11, 2025), so the stage was meant
    // to be MAINTENANCE but the treatment_stage field never updated.
    // Sync them so the dashboard's stage-based content renders again.
    treatment_stage: "FREE_MAINTENANCE",
    modified_at: FieldValue.serverTimestamp(),
  });
  const fresh = (await d.ref.get()).data() as any;
  console.log("✓ updated", d.id);
  console.log("treatment_stage:", fresh.treatment_stage);
  console.log("free_maintenance_switched_at_date:", fresh.free_maintenance_switched_at_date);
  console.log("open_account:", fresh.open_account);
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
