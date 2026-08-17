import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const DRY_RUN = !process.argv.includes("--apply");

(async () => {
  // 1. Build a lookup of (gender, exercise_name, duration) → video
  const menModels = await db.collection("FREEV2_MEN_MAINTENANCE_EXERCISES_MODEL").get();
  const womenModels = await db.collection("FREEV2_WOMEN_MAINTENANCE_EXERCISES_MODEL").get();

  // Models also exist in stoppage collections — use those as source of truth
  // since those have the 6-min videos too
  const menStopModels = await db.collection("FREEV2_MEN_STOPPAGE_EXERCISES_MODEL").get();
  const womenStopModels = await db.collection("FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL").get();

  function buildLookup(docs: any[]): Record<string, Record<number, any>> {
    const lookup: Record<string, Record<number, any>> = {};
    for (const d of docs) {
      const data = d.data();
      const name = data.name;
      if (!name) continue;
      lookup[name] = {};
      for (const v of (data.videos || [])) {
        lookup[name][v.duration] = v;
      }
    }
    return lookup;
  }

  // Merge men maintenance + stoppage so we have ALL durations available
  const menByName: Record<string, Record<number, any>> = {};
  for (const src of [menStopModels.docs, menModels.docs]) {
    const l = buildLookup(src);
    for (const [name, durs] of Object.entries(l)) {
      if (!menByName[name]) menByName[name] = {};
      Object.assign(menByName[name], durs);
    }
  }
  const womenByName: Record<string, Record<number, any>> = {};
  for (const src of [womenStopModels.docs, womenModels.docs]) {
    const l = buildLookup(src);
    for (const [name, durs] of Object.entries(l)) {
      if (!womenByName[name]) womenByName[name] = {};
      Object.assign(womenByName[name], durs);
    }
  }

  console.log(DRY_RUN ? "═══ DRY RUN ═══\n" : "═══ APPLYING ═══\n");

  // 2. Find all maintenance users with broken days
  const users = await db.collection("Users")
    .where("treatment_stage", "==", "FREE_MAINTENANCE")
    .get();

  let patchedUsers = 0;
  let patchedTasks = 0;
  let couldNotPatch = 0;

  for (const userDoc of users.docs) {
    const x = userDoc.data() as any;
    const mp = x.maintenance_progress;
    if (!mp || Object.keys(mp).length === 0) continue;

    const gender = x.selected_gender;
    const lookup = gender === "female" ? womenByName : menByName;

    const updates: Record<string, any> = {};
    let userPatched = false;
    let thisUserTaskPatched = 0;

    for (const [dayKey, tasks] of Object.entries(mp)) {
      if (!Array.isArray(tasks)) continue;
      let dayChanged = false;
      const newTasks = tasks.map((t: any) => {
        if (t.videos && t.videos.length > 0) return t;
        // Broken task — try to patch
        const byDuration = lookup[t.exercise_id];
        if (!byDuration) {
          couldNotPatch++;
          return t;
        }
        const video = byDuration[t.duration];
        if (!video) {
          couldNotPatch++;
          return t;
        }
        dayChanged = true;
        thisUserTaskPatched++;
        return { ...t, videos: [video] };
      });
      if (dayChanged) {
        updates[`maintenance_progress.${dayKey}`] = newTasks;
        userPatched = true;
      }
    }

    if (userPatched) {
      patchedUsers++;
      patchedTasks += thisUserTaskPatched;
      if (!DRY_RUN) {
        await userDoc.ref.update(updates);
      }
      if (patchedUsers <= 5) {
        console.log(`${DRY_RUN ? "[would patch]" : "[patched]"} ${x.email || userDoc.id}: ${thisUserTaskPatched} tasks across ${Object.keys(updates).length} days`);
      }
    }
  }

  console.log(`\n═══ RESULTS ═══`);
  console.log(`Users patched:              ${patchedUsers}`);
  console.log(`Tasks patched:              ${patchedTasks}`);
  console.log(`Tasks that couldn't patch:  ${couldNotPatch}`);
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
