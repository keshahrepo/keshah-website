// Fuzzy lookup: user matching "saadsih" and common spelling variants.

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
  const needles = [
    "saadsih", "saadish", "sadish", "sadesh", "saadesh",
    "sadis", "saadi", "sadhish", "sadeesh", "sadeeq",
    "sadhis", "sadhi", "sadiq", "saadiq", "sadiqu",
    "sasish", "sassi",
  ];
  const snap = await db.collection("Users").get();
  const hits: { uid: string; email: string; name: string; stage: string; needle: string }[] = [];
  for (const doc of snap.docs) {
    const x = doc.data() as Record<string, unknown>;
    const email = ((x.email as string) || "").toLowerCase();
    const first = ((x.first_name as string) || "").toLowerCase();
    const last = ((x.last_name as string) || "").toLowerCase();
    const wpName = ((x.wp_user as Record<string, string>)?.display_name || "").toLowerCase();
    const hay = [email, first, last, wpName].join(" ");
    const hit = needles.find((n) => hay.includes(n));
    if (hit) {
      hits.push({
        uid: doc.id,
        email: x.email as string,
        name: [(x.first_name as string) || "", (x.last_name as string) || ""].join(" ").trim()
          || (x.wp_user as Record<string, string>)?.display_name || "-",
        stage: (x.treatment_stage as string) || "-",
        needle: hit,
      });
    }
  }
  console.log(`\nFound ${hits.length} match(es):\n`);
  for (const h of hits) {
    console.log(`  [${h.needle.padEnd(8)}] ${h.email.padEnd(38)} ${h.name.padEnd(20)} ${h.stage.padEnd(20)} ${h.uid}`);
  }
  console.log("");
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
