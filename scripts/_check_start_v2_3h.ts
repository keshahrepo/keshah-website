import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const CUTOFF = new Date(Date.now() - 3 * 3600 * 1000);
(async () => {
  console.log(`\n/start v2 (text-consult) funnel since ${CUTOFF.toISOString()} (~last 3h)\n`);
  const fe = await db.collection("FunnelEvents")
    .where("date", ">=", CUTOFF.toISOString().slice(0, 10))
    .select("step", "sessionId", "source", "timestamp")
    .get();
  const bySrc: Record<string, Record<string, Set<string>>> = {};
  for (const doc of fe.docs) {
    const d = doc.data();
    const ts = d.timestamp as { toMillis?: () => number } | undefined;
    if (!ts?.toMillis || ts.toMillis() < CUTOFF.getTime()) continue;
    const src = (d.source as string) ?? "?";
    const step = d.step as string;
    const sid = d.sessionId as string;
    (bySrc[src] ??= {});
    (bySrc[src][step] ??= new Set()).add(sid);
  }
  const STEPS = [
    "landingHook", "founderStory", "momentCheckYourScalp", "quizGender",
    "pinchTest", "momentHereIsWhatHappens", "resultScreenshots",
    "momentBuildYourPlan", "qualification", "hairLossLocation",
    "hairLossMedicationMen", "familyHistory", "commitment", "textConsult",
    "text_handoff_clicked",
    "trialPaywall", "payment"
  ];
  for (const [src, stepMap] of Object.entries(bySrc).sort()) {
    console.log(`── source="${src}" ──`);
    for (const step of STEPS) {
      const n = stepMap[step]?.size ?? 0;
      if (n > 0) console.log(`  ${step.padEnd(28)} ${n}`);
    }
    console.log();
  }
})().catch(e => { console.error(e); process.exit(1); });
