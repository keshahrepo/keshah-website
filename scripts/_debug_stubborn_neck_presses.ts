import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function main() {
  console.log("=== 1. Does neck_presses_05 exist in FREEV2_MEN_STOPPAGE_EXERCISES_MODEL? ===");
  const modelDoc = await db
    .collection("FREEV2_MEN_STOPPAGE_EXERCISES_MODEL")
    .doc("neck_presses_05")
    .get();
  if (modelDoc.exists) {
    const d = modelDoc.data()!;
    console.log(`FOUND: id="${d.id}" name="${d.name}" videos=${(d.videos ?? []).length}`);
  } else {
    console.log("NOT FOUND — this is likely bug #1's root cause");
    console.log("Trying without doc-id lookup (maybe stored with different doc id, id field only)...");
  }

  console.log();
  console.log("=== 2. All neck_* docs in the model collection ===");
  const all = await db.collection("FREEV2_MEN_STOPPAGE_EXERCISES_MODEL").get();
  const neck = all.docs.filter((d) => d.id.startsWith("neck_") || (d.data().id ?? "").startsWith("neck_"));
  neck.forEach((d) => console.log(`  docId=${d.id} id="${d.data().id}" name="${d.data().name}"`));
  if (!neck.length) console.log("  (none)");

  console.log();
  console.log(`=== 3. All model docs (first 30 of ${all.size}) ===`);
  all.docs.slice(0, 30).forEach((d) => console.log(`  docId=${d.id} id="${d.data().id}" name="${d.data().name}"`));

  console.log();
  const email = process.argv[2];
  if (!email) {
    console.log("=== Skipping user check — pass email as argv[2] to check a user's progress ===");
    return;
  }
  console.log(`=== 4. User ${email} ===`);
  const users = await db.collection("Users").where("email", "==", email).limit(1).get();
  if (users.empty) {
    console.log("  no user found");
    return;
  }
  const user = users.docs[0];
  const data = user.data();
  console.log(`  uid: ${user.id}`);
  console.log(`  user_type: ${data.user_type} treatment_stage: ${data.treatment_stage} gender: ${data.selected_gender}`);
  console.log(`  stubborn_scalp: ${data.stubborn_scalp}`);
  console.log(`  scalp_check_answers: ${JSON.stringify(data.scalp_check_answers ?? {})}`);
  const progress = data.progress ?? {};
  const days = Object.keys(progress).sort((a, b) => parseInt(a.replace("day", "")) - parseInt(b.replace("day", "")));
  console.log(`  progress keys: ${days.join(", ")}`);
  for (const key of ["day5", "day6", "day7", "day8"]) {
    const day = progress[key];
    if (!day) {
      console.log(`  ${key}: MISSING`);
      continue;
    }
    if (Array.isArray(day)) {
      const names = day.map((e: any) => `${e.exercise_id}${e.is_completed ? "✓" : ""}`);
      console.log(`  ${key}: [${names.join(", ")}]`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
