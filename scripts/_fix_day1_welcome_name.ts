// One-shot: rename the founder_day1_welcome exercise from
// "A note from Aadi" to "4 Questions I Get After Day 1".
// Updates name + videos[0].title + description on both men + women docs.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const APPLY = process.argv.includes("--apply");

const NEW_NAME = "4 Questions I Get After Day 1";
const NEW_DESCRIPTION =
  "The four questions Aadi gets most from people right after their first session — answered.";
const NEW_SUBTITLE = "Day 1 Q&A";

const COLLECTIONS = [
  "FREEV2_MEN_STOPPAGE_EXERCISES_MODEL",
  "FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL",
];

(async () => {
  for (const coll of COLLECTIONS) {
    const ref = db.collection(coll).doc("founder_day1_welcome");
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`! ${coll}/founder_day1_welcome missing, skipping`);
      continue;
    }
    const data = snap.data() as { videos?: Array<Record<string, unknown>> };
    const videos = (data.videos ?? []).map((v, i) =>
      i === 0 ? { ...v, title: NEW_NAME, subtitle: NEW_SUBTITLE } : v,
    );
    const update = {
      name: NEW_NAME,
      description: NEW_DESCRIPTION,
      videos,
    };
    if (APPLY) {
      await ref.update(update);
      console.log(`✓ ${coll}/founder_day1_welcome renamed`);
    } else {
      console.log(`[dry] ${coll}/founder_day1_welcome`);
      console.log(`  name → "${NEW_NAME}"`);
      console.log(`  description → "${NEW_DESCRIPTION}"`);
      console.log(`  videos[0].title → "${NEW_NAME}"`);
      console.log(`  videos[0].subtitle → "${NEW_SUBTITLE}"`);
    }
  }
  process.exit(0);
})().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
