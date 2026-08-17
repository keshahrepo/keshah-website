import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", "==", "spencerkrug40@gmail.com").limit(1).get();
  if (snap.empty) { console.log("NOT FOUND"); process.exit(1); }
  const d = snap.docs[0];
  const now = new Date();
  // start_date format mirrors PostAuthFlow2's save-profile shape: { date, time }.
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  await d.ref.update({
    open_account: true,
    start_date: { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` },
    starter_photos_submit_submitted_once: true,
    starter_photos_submitted_once: true,
    treatment_stage: "FREE_STOPPAGE",
    free_stoppage_switched_at_date: `${yyyy}-${mm}-${dd}`,
    modified_at: FieldValue.serverTimestamp(),
  });
  console.log("✓ updated", d.id);
  const fresh = (await d.ref.get()).data() as any;
  console.log("open_account:", fresh.open_account);
  console.log("start_date:", JSON.stringify(fresh.start_date));
  console.log("starter_photos_submit_submitted_once:", fresh.starter_photos_submit_submitted_once);
  console.log("treatment_stage:", fresh.treatment_stage);
  console.log("free_stoppage_switched_at_date:", fresh.free_stoppage_switched_at_date);
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
