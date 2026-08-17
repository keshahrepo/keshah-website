// Check whether a user qualifies for the KESHAH refund guarantee.
//
// Eligibility:
//   1. user_type = "vip" OR a paid app subscription
//   2. >= 96 of 120 days completed (day with any is_completed:true task)
//   3. Refund request within 60 days of completing day 120
//
// Usage: npx tsx scripts/_check_refund_eligibility.ts <email>

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: _check_refund_eligibility.ts <email>");
    process.exit(1);
  }

  const snap = await db.collection("Users").where("email", "==", email).limit(1).get();
  if (snap.empty) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  const doc = snap.docs[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const x = doc.data() as any;

  console.log(`User: ${doc.id}`);
  console.log(`  email:           ${x.email}`);
  console.log(`  user_type:       ${x.user_type ?? "(unset)"}`);
  console.log(`  treatment_stage: ${x.treatment_stage ?? "(unset)"}`);
  console.log(`  start_date:      ${x.start_date?.date ?? "-"}`);
  console.log("");

  const prog = x.progress || {};

  // Count days in [1..120] where >=1 task has is_completed: true.
  let completed = 0;
  const completedDays: number[] = [];
  for (let d = 1; d <= 120; d++) {
    const tasks = prog[`day${d}`];
    if (Array.isArray(tasks)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const any = tasks.some((t: any) => t?.is_completed === true);
      if (any) {
        completed += 1;
        completedDays.push(d);
      }
    }
  }

  // Compute when day 120 lands based on start_date (DD/MM/YYYY).
  let day120Date: Date | null = null;
  if (x.start_date?.date) {
    const [dd, mm, yyyy] = x.start_date.date.split("/").map(Number);
    const start = new Date(yyyy, mm - 1, dd);
    day120Date = new Date(start.getTime() + 119 * 86400000); // day 120 = 119 days after day 1
  }

  const now = new Date();
  console.log(`Completed days in 1..120 (is_completed:true): ${completed} / 120`);
  console.log(`Threshold for refund (>=96):                  ${completed >= 96 ? "✓ MET" : "✗ NOT MET"}`);
  if (completedDays.length > 0) {
    console.log(`First completed: day${completedDays[0]}    Last: day${completedDays[completedDays.length-1]}`);
  }

  if (day120Date) {
    const refundOpens = day120Date;
    const refundCloses = new Date(day120Date.getTime() + 60 * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    console.log("");
    console.log(`Day 120 reached on:        ${fmt(refundOpens)}`);
    console.log(`Refund window closes:      ${fmt(refundCloses)}  (60 days after day 120)`);
    console.log(`Today:                     ${fmt(now)}`);
    const inWindow = now >= refundOpens && now <= refundCloses;
    const beforeWindow = now < refundOpens;
    const afterWindow = now > refundCloses;
    console.log(`In refund window:          ${inWindow ? "✓ YES" : beforeWindow ? "✗ NO (program not done yet)" : "✗ NO (window has closed)"}`);
    if (afterWindow) {
      const daysOver = Math.floor((now.getTime() - refundCloses.getTime()) / 86400000);
      console.log(`Window closed ${daysOver} days ago`);
    }
  }

  console.log("");
  const userTypeOk = x.user_type === "vip" || x.user_type === "freev2" || x.user_type === "paid";
  const planOk = x.user_type === "vip"; // VIP confirmed; app sub status unclear from user_type alone
  console.log(`Plan eligible (vip or app sub): ${userTypeOk ? "✓ likely" : "✗ no"}  (user_type=${x.user_type})`);

  // Final verdict
  console.log("");
  console.log("══════════════════════════════════════════════");
  const completionOk = completed >= 96;
  let windowOk = false;
  if (day120Date) {
    const refundCloses = new Date(day120Date.getTime() + 60 * 86400000);
    windowOk = now >= day120Date && now <= refundCloses;
  }
  if (userTypeOk && completionOk && windowOk) {
    console.log("VERDICT: ✓ QUALIFIES for refund");
  } else {
    console.log("VERDICT: ✗ DOES NOT QUALIFY");
    if (!completionOk) console.log(`  Reason: only ${completed}/120 days completed (need 96)`);
    if (!windowOk && day120Date) {
      if (now < day120Date) console.log(`  Reason: program not yet finished (day 120 not reached)`);
      else console.log(`  Reason: refund window has closed`);
    }
    if (!userTypeOk) console.log(`  Reason: not a paid plan (user_type=${x.user_type})`);
  }
  console.log("══════════════════════════════════════════════");

  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
