import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const since = Timestamp.fromMillis(Date.now() - 6 * 3600 * 1000);
  const snap = await db.collection("Users")
    .where("scalp_tension_baseline_started_at", ">=", since).get();
  for (const d of snap.docs) {
    const u:any = d.data();
    console.log(d.id, "·", u.email);
    console.log("  scalp_tension_baseline:", u.scalp_tension_baseline);
    console.log("  scalp_tension_baseline_at:", u.scalp_tension_baseline_at?.toDate?.() ?? u.scalp_tension_baseline_at);
    console.log("  started_at:", u.scalp_tension_baseline_started_at?.toDate?.());
  }
})();
