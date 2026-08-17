// Backfill start_date for optionlimite@gmail.com so she lands on Day 1
// today. Mirrors the structure DashBoardBloc.getDifferenceDayBasedOnStartDate
// expects (map: {date, time, timezone, timeZoneOffsetInMins}).

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UID = "mL0HA93dlqof6XxDSEnj";   // optionlimite
const EMAIL = "optionlimite@gmail.com";

(async () => {
  const ref = db.collection("Users").doc(UID);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`✗ doc ${UID} not found`);
    process.exit(1);
  }
  const d = snap.data() as any;
  console.log(`▸ Pre-fix:`);
  console.log(`    email:            ${d.email}`);
  console.log(`    user_type:        ${d.user_type}`);
  console.log(`    start_date:       ${JSON.stringify(d.start_date)}`);
  console.log(`    converted_at:     ${d.converted_at?.toDate?.()?.toISOString()}`);

  // Build start_date for today. Use her phone country (PF = French Polynesia)
  // but the timezone affects userDay calc. Safest: use current UTC date and
  // a UTC offset that puts "today" in her local frame. Without knowing her
  // device tz, set timezone to UTC and time to noon UTC — daysSinceStart
  // calc is date-string based (DD/MM/YYYY), so the timezone is informational.
  const now = new Date();
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = now.getUTCFullYear();
  const start_date = {
    date: `${dd}/${mm}/${yyyy}`,
    time: "12:00 PM",
    timezone: "UTC",
    timeZoneOffsetInMins: 0,
  };

  await ref.update({
    start_date,
    modified_at: FieldValue.serverTimestamp(),
  });
  console.log(`\n▸ Wrote start_date = ${JSON.stringify(start_date)}`);

  const after = (await ref.get()).data() as any;
  console.log(`\n▸ Post-fix:`);
  console.log(`    start_date:       ${JSON.stringify(after.start_date)}`);
  console.log(`\nShe should now land on Day 1 after app relaunch (Womens_Free_Exercise_List/Day1).`);
})();
