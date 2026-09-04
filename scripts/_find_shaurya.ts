import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  // Fuzzy search — grab users whose email contains "shaurya"
  const snap = await db.collection("Users").where("email", ">=", "shaurya").where("email", "<", "shauryz").get();
  console.log("matches:", snap.size);
  for (const d of snap.docs) {
    const u:any = d.data();
    console.log(" ", d.id, "·", u.email, "· created:", u.created_at?.toDate?.()?.toISOString(), "· user_type:", u.user_type);
  }
})();
