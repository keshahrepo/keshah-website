import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  // Try prefixes since the email might have a typo
  for (const prefix of ["jody", "ody.d", "jodyd", "jody.d"]) {
    const snap = await db.collection("Users").where("email", ">=", prefix).where("email", "<", prefix.slice(0,-1) + String.fromCharCode(prefix.charCodeAt(prefix.length-1)+1)).limit(20).get();
    console.log(`prefix='${prefix}': ${snap.size} matches`);
    for (const d of snap.docs) {
      const u:any = d.data();
      console.log(" ", d.id, "·", u.email, "· treatment_stage:", u.treatment_stage, "· gender:", u.selected_gender);
    }
  }
})();
