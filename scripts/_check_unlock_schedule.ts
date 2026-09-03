import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function main() {
  for (const docId of ["exercises_unlocks", "exercises_unlocks_free_stoppage"]) {
    const snap = await db.collection("Settings").doc(docId).get();
    if (!snap.exists) {
      console.log(`\n${docId}: (missing)`);
      continue;
    }
    const data = snap.data() as { men?: Array<{ title?: string; days?: number }>; women?: Array<{ title?: string; days?: number }> };
    for (const gender of ["men", "women"] as const) {
      const arr = data[gender] ?? [];
      const sorted = [...arr].sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
      console.log(`\n${docId} · ${gender}:  (${sorted.length} entries)`);
      for (const e of sorted) {
        console.log(`  day ${String(e.days).padStart(3)}  ${e.title}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
