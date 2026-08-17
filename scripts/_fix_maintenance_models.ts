import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const DRY_RUN = !process.argv.includes("--apply");

(async () => {
  // For each exercise where stoppage has durations maintenance lacks,
  // add the missing durations to maintenance models by copying from stoppage.
  const stopSnap = await db.collection("FREEV2_MEN_STOPPAGE_EXERCISES_MODEL").get();
  const maintSnap = await db.collection("FREEV2_MEN_MAINTENANCE_EXERCISES_MODEL").get();

  const stopById: Record<string, any> = {};
  for (const d of stopSnap.docs) stopById[d.data().id] = { docId: d.id, data: d.data() };

  const maintById: Record<string, any> = {};
  for (const d of maintSnap.docs) maintById[d.data().id] = { docId: d.id, data: d.data() };

  console.log(DRY_RUN ? "═══ DRY RUN (add --apply to execute) ═══\n" : "═══ APPLYING FIX ═══\n");

  for (const [id, maintRec] of Object.entries(maintById)) {
    const stopRec = stopById[id];
    if (!stopRec) continue;

    const maintDurations = new Set((maintRec.data.videos || []).map((v: any) => v.duration));
    const stopDurations = new Set((stopRec.data.videos || []).map((v: any) => v.duration));
    const missing = [...stopDurations].filter(d => !maintDurations.has(d));
    if (missing.length === 0) {
      console.log(`✓ ${id}: no gaps`);
      continue;
    }

    const newVideos = [...(maintRec.data.videos || [])];
    for (const dur of missing) {
      const stopVideo = (stopRec.data.videos || []).find((v: any) => v.duration === dur);
      if (stopVideo) {
        newVideos.push(stopVideo);
        console.log(`  + ${id}: add duration=${dur} video from stoppage (${stopVideo.url?.slice(-60) || "no url"})`);
      }
    }

    if (!DRY_RUN) {
      await db.collection("FREEV2_MEN_MAINTENANCE_EXERCISES_MODEL")
        .doc(maintRec.docId)
        .update({ videos: newVideos });
      console.log(`    → written to ${maintRec.docId}`);
    }
  }

  // Same for women
  const stopWSnap = await db.collection("FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL").get();
  const maintWSnap = await db.collection("FREEV2_WOMEN_MAINTENANCE_EXERCISES_MODEL").get();
  const stopWById: Record<string, any> = {};
  for (const d of stopWSnap.docs) stopWById[d.data().id] = { docId: d.id, data: d.data() };
  const maintWById: Record<string, any> = {};
  for (const d of maintWSnap.docs) maintWById[d.data().id] = { docId: d.id, data: d.data() };

  console.log(`\n── WOMEN ──`);
  for (const [id, maintRec] of Object.entries(maintWById)) {
    const stopRec = stopWById[id];
    if (!stopRec) continue;
    const maintDurations = new Set((maintRec.data.videos || []).map((v: any) => v.duration));
    const stopDurations = new Set((stopRec.data.videos || []).map((v: any) => v.duration));
    const missing = [...stopDurations].filter(d => !maintDurations.has(d));
    if (missing.length === 0) {
      console.log(`✓ ${id}: no gaps`);
      continue;
    }
    const newVideos = [...(maintRec.data.videos || [])];
    for (const dur of missing) {
      const stopVideo = (stopRec.data.videos || []).find((v: any) => v.duration === dur);
      if (stopVideo) {
        newVideos.push(stopVideo);
        console.log(`  + ${id}: add duration=${dur} video from stoppage`);
      }
    }
    if (!DRY_RUN) {
      await db.collection("FREEV2_WOMEN_MAINTENANCE_EXERCISES_MODEL")
        .doc(maintRec.docId)
        .update({ videos: newVideos });
      console.log(`    → written to ${maintRec.docId}`);
    }
  }

  console.log(`\n${DRY_RUN ? "DRY RUN complete — add --apply to write." : "✓ DONE"}`);
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
