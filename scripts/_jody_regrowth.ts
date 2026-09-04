import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", "==", "jody.dauth@gmail.com").get();
  const u: any = snap.docs[0].data();
  console.log("regrowth_switched_at_date:", u.regrowth_switched_at_date);
  console.log("regrowth_progress days:", Object.keys(u.regrowth_progress ?? {}).sort());
  for (const [day, arr] of Object.entries(u.regrowth_progress ?? {})) {
    const completed = Array.isArray(arr) ? arr.filter((e:any) => e?.is_completed === true).length : 0;
    const total = Array.isArray(arr) ? arr.length : 0;
    console.log(`  ${day}: ${completed}/${total} completed`);
  }
})();
