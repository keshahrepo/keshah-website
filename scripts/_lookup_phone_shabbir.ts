import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const email = "shabbirrafiq4@gmail.com";

(async () => {
  const snap = await db.collection("Users").where("email", "==", email).get();
  console.log(`Users docs with email=${email}: ${snap.size}`);
  snap.docs.forEach((d, i) => {
    const x = d.data();
    console.log(`\n[${i}] UID: ${d.id}`);
    console.log(`    phone_number:   ${JSON.stringify(x.phone_number)}`);
    console.log(`    displayName:    ${x.wp_user?.displayName || x.wp_user?.display_name || "-"}`);
    console.log(`    providerId:     ${x.providerId || "-"}`);
    console.log(`    created_at:     ${x.created_at?.toDate?.()?.toISOString() || "-"}`);
  });
  process.exit(0);
})();
