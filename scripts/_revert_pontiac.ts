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
    treatment_stage: "FREE_STOPPAGE",
    modified_at: FieldValue.serverTimestamp(),
  });
  const fresh = (await d.ref.get()).data() as any;
  console.log("✓ reverted", d.id);
  console.log("treatment_stage:", fresh.treatment_stage);
  console.log("open_account:", fresh.open_account);
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
