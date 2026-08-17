import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const ids = [
    "science_of_hair_loss_00",
    "what_to_expect_00",
    "founder_regrow_day_5",
    "founder_check_in_day_7",
    "founder_qa_day_15",
  ];
  console.log("FREEV2_MEN_STOPPAGE_EXERCISES_MODEL");
  for (const id of ids) {
    const doc = await db.collection("FREEV2_MEN_STOPPAGE_EXERCISES_MODEL").doc(id).get();
    if (!doc.exists) {
      console.log(`  ${id}: (missing)`);
      continue;
    }
    const d = doc.data() as Record<string, unknown>;
    console.log(`  ${id}: title="${d.title || d.name || "-"}", videoUrl=${(d.videoUrl as string | undefined)?.slice(0, 60) || "-"}`);
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
