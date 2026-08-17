// Deep dump all fields on hallowidwan@gmail.com to check for anything
// unusual that could cause the app to hang on the splash screen.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const email = "hallowidwan@gmail.com";
  const snap = await db.collection("Users").where("email", "==", email).limit(1).get();
  if (snap.empty) { console.log("no user"); process.exit(1); }
  const d = snap.docs[0];
  const x = d.data();
  console.log("UID:", d.id);
  console.log("\nAll keys + values:");
  for (const [k, v] of Object.entries(x)) {
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    console.log(`  ${k}: ${s.length > 200 ? s.slice(0, 200) + "…" : s}`);
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
