// Quick fix for najinthant@gmail.com.
//
// He's a VIP male user at userDay ~425 (aftercare). The dashboard's
// getTodayTaskList short-circuits if aftercare_progress.day{N} already
// exists, so a stale/empty day entry locks the UI into the empty state.
// We find the highest day# in his aftercare_progress and delete it so
// the app re-runs getAfterCareDataFromListTable on next launch.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UID = "NtFTj5PCTGYUGLLx9xPMnEVXUMb2"; // najinthant

(async () => {
  const ref = db.collection("Users").doc(UID);
  const snap = await ref.get();
  if (!snap.exists) { console.log("✗ no doc"); process.exit(1); }
  const d = snap.data() as any;

  const ap = (d.aftercare_progress || {}) as Record<string, any>;
  const dayKeys = Object.keys(ap).filter(k => /^day\d+$/.test(k));
  const sorted = dayKeys.sort((a, b) => parseInt(b.slice(3), 10) - parseInt(a.slice(3), 10));
  console.log(`▸ aftercare_progress has ${dayKeys.length} day entries`);
  console.log(`  top 5 by day#: ${sorted.slice(0, 5).join(", ")}`);

  if (sorted.length === 0) {
    console.log(`✗ no aftercare_progress entries to clean. Quick-fix doesn't apply.`);
    process.exit(0);
  }

  const top = sorted[0];
  const topVal = ap[top];
  console.log(`\n▸ Highest day key: ${top}`);
  if (Array.isArray(topVal)) {
    console.log(`  type: array length=${topVal.length}`);
    console.log(`  preview: ${JSON.stringify(topVal).slice(0, 300)}`);
    const completed = topVal.filter((e: any) => e?.is_completed === true).length;
    console.log(`  completed entries: ${completed}/${topVal.length}`);
    if (completed > 0) {
      console.log(`  ⚠ ${completed} completed entries in this day — DELETING would lose progress!`);
      console.log(`  aborting. inspect and decide manually.`);
      process.exit(1);
    }
  } else {
    console.log(`  type: ${typeof topVal}, value: ${JSON.stringify(topVal).slice(0, 200)}`);
  }

  // Delete the single day key via dot-notation
  console.log(`\n▸ Deleting aftercare_progress.${top}`);
  await ref.update({
    [`aftercare_progress.${top}`]: FieldValue.delete(),
    modified_at: FieldValue.serverTimestamp(),
  });

  const after = (await ref.get()).data() as any;
  const apAfter = (after.aftercare_progress || {}) as Record<string, any>;
  console.log(`  ✓ aftercare_progress now has ${Object.keys(apAfter).length} day entries`);
  console.log(`  ${top} present?  ${`${top}` in apAfter ? "YES (delete failed)" : "NO ✓"}`);

  console.log(`\nAsk najinthant to relaunch the app. The dashboard should re-fetch ${top}.`);
})();
