// Look up a user by partial name/email match. Widwan / Wirad / Idwan.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const needles = ["widwan", "wirad", "idwan"];
  const snap = await db.collection("Users").get();
  const hits: { uid: string; email: string; name: string; stage: string }[] = [];
  for (const doc of snap.docs) {
    const x = doc.data() as Record<string, unknown>;
    const email = ((x.email as string) || "").toLowerCase();
    const first = ((x.first_name as string) || "").toLowerCase();
    const wpName = ((x.wp_user as Record<string, string>)?.display_name || "").toLowerCase();
    if (needles.some((n) => email.includes(n) || first.includes(n) || wpName.includes(n))) {
      hits.push({
        uid: doc.id,
        email: x.email as string,
        name: (x.first_name as string) || (x.wp_user as Record<string, string>)?.display_name || "-",
        stage: (x.treatment_stage as string) || "-",
      });
    }
  }
  console.log(`\nFound ${hits.length} match(es):\n`);
  for (const h of hits) {
    console.log(`  ${h.email.padEnd(38)} ${h.name.padEnd(15)} ${h.stage.padEnd(20)} ${h.uid}`);
  }
  console.log("");
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
