import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", ">=", "grover").where("email", "<", "grovez").get();
  console.log("matches for 'grover*':", snap.size);
  for (const d of snap.docs) {
    const u:any = d.data();
    console.log(" ", d.id, "·", u.email);
  }
})();
