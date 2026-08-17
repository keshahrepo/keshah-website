import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  // 1. Find all FREE_MAINTENANCE users
  const snap = await db.collection("Users")
    .where("treatment_stage", "==", "FREE_MAINTENANCE")
    .get();
  console.log(`FREE_MAINTENANCE users: ${snap.size}\n`);

  // 2. Check their maintenance_progress state
  let hasMaintProgress = 0, empty = 0, hasValidVideos = 0, hasEmptyVideos = 0;
  let totalDaysChecked = 0, daysWithEmptyVideos = 0;
  const sampleBroken: any[] = [];

  for (const d of snap.docs) {
    const x = d.data() as any;
    const mp = x.maintenance_progress;
    if (!mp || Object.keys(mp).length === 0) {
      empty++;
      continue;
    }
    hasMaintProgress++;

    // Check each day's videos
    let userHasBroken = false;
    for (const [key, tasks] of Object.entries(mp)) {
      if (!Array.isArray(tasks)) continue;
      totalDaysChecked++;
      const brokenTasks = tasks.filter((t: any) => !t.videos || t.videos.length === 0);
      if (brokenTasks.length > 0) {
        daysWithEmptyVideos++;
        userHasBroken = true;
      }
    }
    if (userHasBroken) {
      hasEmptyVideos++;
      if (sampleBroken.length < 3) {
        sampleBroken.push({
          uid: d.id,
          email: x.email,
          selected_gender: x.selected_gender,
          treatment_stage: x.treatment_stage,
          free_maintenance_switched_at_date: x.free_maintenance_switched_at_date,
          maintenance_progress_keys: Object.keys(mp).sort(),
          day_sample: Object.entries(mp).slice(-1).map(([k, v]: any) => ({
            day: k,
            task_count: Array.isArray(v) ? v.length : 0,
            sample_task: Array.isArray(v) && v[0] ? {
              title: v[0].title,
              video_count: v[0].videos?.length || 0,
              thumbnail: v[0].thumbnailImage || "(none)",
              is_completed: v[0].is_completed,
            } : null,
          })),
        });
      }
    } else {
      hasValidVideos++;
    }
  }

  console.log(`With maintenance_progress: ${hasMaintProgress}`);
  console.log(`  ...with all videos intact:  ${hasValidVideos}`);
  console.log(`  ...with some empty videos:  ${hasEmptyVideos}`);
  console.log(`Empty maintenance_progress:    ${empty}\n`);
  console.log(`Total days checked:            ${totalDaysChecked}`);
  console.log(`Days with empty videos:        ${daysWithEmptyVideos}\n`);

  console.log(`Sample broken users:`);
  for (const s of sampleBroken) {
    console.log(JSON.stringify(s, null, 2));
  }

  // 3. Check the maintenance exercise models collection directly
  console.log(`\n\n=== Firestore exercise collections ===`);
  const collections = [
    "freev2_men_maintenance_exercises_model",
    "freev2_men_maintenance_exercises",
    "freev2_men_stoppage_exercises_model",
    "freev2_men_stoppage_exercises",
  ];
  for (const name of collections) {
    try {
      const c = await db.collection(name).limit(5).get();
      console.log(`\n${name}: ${c.size} docs shown`);
      for (const d of c.docs) {
        const data = d.data();
        const ids: any = {};
        if (data.id) ids.id = data.id;
        if (data.name) ids.name = data.name;
        if (data.exercises) ids.exercises = (data.exercises as any[]).slice(0, 3).map((e: any) => e.exerciseId || e.exercise_id);
        if (data.videos) ids.video_count = data.videos.length;
        console.log(`  ${d.id} · ${JSON.stringify(ids)}`);
      }
    } catch (e: any) {
      console.log(`  ERR: ${e.message}`);
    }
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
