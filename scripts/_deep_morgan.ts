// Deep audit of Morgan Buckley's state — regrowth_progress integrity,
// pin-treatment availability for his user type, and recovery plan.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UID = "2KS4YWgW2LNS8DD5oNcMd1vMePA3";

function isThirdDayOfWeek(day: number): boolean {
  // From dashboard_repo: days 3, 10, 17, 24, 31, ... (every 7 days starting at day 3)
  return day >= 3 && (day - 3) % 7 === 0;
}

(async () => {
  const ref = db.collection("Users").doc(UID);
  const snap = await ref.get();
  const x: any = snap.data();

  console.log(`▸ Morgan Buckley`);
  console.log(`  user_type:               ${x.user_type}`);
  console.log(`  treatment_stage:         ${x.treatment_stage}`);
  console.log(`  regrowth_switched_at:    ${x.regrowth_switched_at_date}`);
  console.log(`  start_date:              ${JSON.stringify(x.start_date)}`);

  // Compute today's regrowthDay
  // regrowth_switched_at = 05/05/2026, today = 11/06/2026
  const [d, m, y] = x.regrowth_switched_at_date.split("/").map(Number);
  const switched = Date.UTC(y, m - 1, d);
  const today = Date.UTC(2026, 5, 11);  // June 11 (month 5 = June, 0-indexed)
  const daysSinceSwitch = Math.floor((today - switched) / 86_400_000);
  const regrowthDay = daysSinceSwitch + 1;
  console.log(`  computed regrowthDay:    ${regrowthDay} (switched ${daysSinceSwitch} days ago)`);

  // ── Audit regrowth_progress ─────────────────────────────────
  const rp = (x.regrowth_progress || {}) as Record<string, any>;
  const keys = Object.keys(rp).filter(k => /^day\d+$/.test(k));
  console.log(`\n▸ regrowth_progress: ${keys.length} day entries`);

  const dayNums = keys.map(k => parseInt(k.slice(3), 10)).sort((a, b) => a - b);
  console.log(`  day range: ${dayNums[0]}…${dayNums[dayNums.length-1]}`);
  console.log(`  expected if uninterrupted (1..${regrowthDay}): ${regrowthDay} days. Have ${dayNums.length}. Missing ${regrowthDay - dayNums.length} days.`);

  // Find missing day numbers in 1..regrowthDay
  const present = new Set(dayNums);
  const missing: number[] = [];
  for (let i = 1; i <= regrowthDay; i++) if (!present.has(i)) missing.push(i);
  console.log(`  missing days: [${missing.join(", ")}]`);

  // Find pin-treatment days
  const pinDays = [];
  for (let i = 1; i <= regrowthDay; i++) if (isThirdDayOfWeek(i)) pinDays.push(i);
  console.log(`\n▸ Pin-treatment days expected so far: [${pinDays.join(", ")}]`);

  // Audit each existing day for pin treatment
  console.log(`\n▸ Day-by-day audit:`);
  for (const day of dayNums) {
    const entry = rp[`day${day}`];
    if (!Array.isArray(entry)) {
      console.log(`  day${day}: ${typeof entry} (NOT an array)`);
      continue;
    }
    const exNames = entry.map((e: any) => e.exercise_id || e.title || "?");
    const completed = entry.filter((e: any) => e?.is_completed === true).length;
    const hasPin = exNames.some((n: string) => /pen|pin|treatment|microneedl/i.test(n));
    const tag = isThirdDayOfWeek(day) ? "[PIN-DAY]" : "         ";
    const pinFlag = hasPin ? "✓ pin" : (isThirdDayOfWeek(day) ? "✗ MISSING PIN" : "no pin (expected)");
    console.log(`  ${tag} day${String(day).padStart(3)}: ${entry.length} tasks, ${completed} completed, ${pinFlag}  [${exNames.slice(0,4).join(", ")}]`);
  }

  // ── Check pen_treatment_06 availability in each Exercise_Models variant ─
  console.log(`\n▸ pen_treatment_06 availability across model collections:`);
  for (const col of ["Exercise_Models", "Free_Exercise_Models", "Womens_Exercise_Models", "Womens_Free_Exercise_Models"]) {
    const doc = await db.collection(col).doc("pen_treatment_06").get();
    console.log(`  ${col}/pen_treatment_06: ${doc.exists ? "✓ exists" : "✗ MISSING"}`);
  }
})();
