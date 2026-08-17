import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users")
    .where("user_type","==","freev2")
    .where("treatment_stage","==","FREE_STOPPAGE")
    .limit(20).get();
  let withSd = 0, withoutSd = 0;
  for (const d of snap.docs) {
    const x = d.data() as any;
    if (x.start_date) { withSd++; if (withSd <= 3) console.log("HAS:", d.id, JSON.stringify(x.start_date), "tags=", JSON.stringify(x.extra_user_tags||[])); }
    else { withoutSd++; if (withoutSd <= 3) console.log("MISSING:", d.id, "created", x.created_at?.toDate?.()?.toISOString(), "tags=", JSON.stringify(x.extra_user_tags||[])); }
  }
  console.log(`\nOf 20 freev2 FREE_STOPPAGE: ${withSd} with start_date, ${withoutSd} without`);
  process.exit(0);
})();
