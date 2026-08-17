// Verify the migration logic on representative cases before --apply.
// 1. Stefan (typical recent maintenance user): day68 conflict, day69-71 missing from progress
// 2. A "stage-flip only" user: no maintenance_progress data
// 3. A heavy-merge user (200+ days of mp data)
// Confirms what the migration would set on Firestore — without writing.

import admin from "firebase-admin";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
let serviceAccount;
try { serviceAccount = JSON.parse(raw); }
catch { serviceAccount = JSON.parse(Buffer.from(raw, "base64").toString("utf-8")); }
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const cases = [
  { tag: "Stefan (recent switch, day68 conflict)", uid: "xLPyaHXXhtJ9jEC0S3Rb" },
  { tag: "Heavy merge (abhi722994@gmail.com, 65 days)", email: "abhi722994@gmail.com" },
  { tag: "Stage-flip only (no mp data)", email: "w7yv54tscn@privaterelay.appleid.com" },
];

for (const c of cases) {
  let doc;
  if (c.uid) {
    doc = await db.collection("Users").doc(c.uid).get();
  } else {
    const snap = await db.collection("Users").where("email", "==", c.email).limit(1).get();
    if (snap.empty) { console.log(`${c.tag}: NOT FOUND`); continue; }
    doc = snap.docs[0];
  }
  const d = doc.data();
  if (d.treatment_stage !== "FREE_MAINTENANCE") {
    console.log(`${c.tag}: not in FREE_MAINTENANCE (skip)`);
    continue;
  }
  console.log(`\n=== ${c.tag} ===`);
  console.log(`UID: ${doc.id}, email: ${d.email}, current stage: ${d.treatment_stage}`);

  const mp = d.maintenance_progress ?? {};
  const p = d.progress ?? {};
  console.log(`mp keys: ${Object.keys(mp).length}, progress keys: ${Object.keys(p).length}`);

  const updated = { ...p };
  const merged = [];
  const conflicts = [];
  let kept = 0;

  for (const dk of Object.keys(mp)) {
    const mpe = mp[dk];
    if (!Array.isArray(mpe) || mpe.length === 0) continue;
    const ex = updated[dk];
    if (!Array.isArray(ex)) {
      updated[dk] = mpe;
      merged.push(dk);
      continue;
    }
    const exComp = ex.every(e => e?.is_completed === true);
    if (exComp) { kept++; conflicts.push({ day: dk, action: "kept progress (already complete)" }); continue; }
    const mpComp = mpe.every(e => e?.is_completed === true);
    if (mpComp) {
      updated[dk] = mpe;
      merged.push(dk);
      conflicts.push({ day: dk, action: "took mp (progress was incomplete, mp complete)" });
    } else {
      kept++;
      conflicts.push({ day: dk, action: "kept progress (both incomplete)" });
    }
  }

  console.log(`Days merged: ${merged.length}`);
  console.log(`Conflicts: ${conflicts.length} (${conflicts.filter(c => c.action.startsWith("kept")).length} kept, ${conflicts.filter(c => c.action.startsWith("took")).length} taken from mp)`);
  if (conflicts.length > 0 && conflicts.length <= 5) {
    conflicts.forEach(c => console.log(`  ${c.day}: ${c.action}`));
  }
  console.log(`Result progress would have ${Object.keys(updated).length} day keys`);
  console.log(`Will write: { treatment_stage: "FREE_STOPPAGE"${merged.length > 0 ? ", progress: <merged map>" : ""} }`);
  console.log(`maintenance_progress preserved (not deleted): ${Object.keys(mp).length} keys remain`);
}
process.exit(0);
