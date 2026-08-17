import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const allSnap = await db.collection("Users").where("start_date", "!=", null).get();
  console.log(`Total users with start_date: ${allSnap.size}`);

  let trialActive = 0;
  let trialCancelled = 0;
  let legitPaid = 0;
  let razorpayPaid = 0;
  let appStorePaid = 0;
  let openAccount = 0;
  let vipPaid = 0;
  let noPaymentEvidence = 0;
  let deleted = 0;

  let hasProgress = 0;
  let hasNoProgress = 0;

  const dayCompletion: Record<number, { completed: number; total: number }> = {};
  const dayCompletionPaidOnly: Record<number, { completed: number; total: number }> = {};

  const now = Date.now();
  const DAY_MS = 86400000;

  for (const doc of allSnap.docs) {
    const d = doc.data();
    if (d.is_deleted) { deleted++; continue; }

    // Classify payment status
    const isTrialActive = d.trial_status === "active";
    const isTrialCancelled = d.trial_status === "cancelled";
    const hasRazorpaySub = !!d.razorpay_subscription_id;
    const hasAppPurchase = !!(d.extra_user_tags?.includes("paidStoppage") || d.user_type === "vip");
    const isOpenAccount = d.open_account === true;

    let category = "no_evidence";
    if (isTrialActive) { trialActive++; category = "trial_active"; }
    else if (isTrialCancelled) { trialCancelled++; category = "trial_cancelled"; }
    else if (hasRazorpaySub) { razorpayPaid++; legitPaid++; category = "razorpay"; }
    else if (hasAppPurchase) { appStorePaid++; legitPaid++; category = "app_store"; }
    else if (isOpenAccount) { openAccount++; legitPaid++; category = "open_account"; }
    else if (d.user_type === "vip") { vipPaid++; legitPaid++; category = "vip"; }
    else { noPaymentEvidence++; }

    // Compute user's current age (days since created_at or start_date parsed)
    let userAgeDays = 0;
    if (d.created_at?.toDate) {
      userAgeDays = Math.floor((now - d.created_at.toDate().getTime()) / DAY_MS);
    }

    const progress = d.progress as Record<string, { is_completed?: boolean }[]> | undefined;
    if (progress && Object.keys(progress).length > 0) hasProgress++;
    else hasNoProgress++;

    // Count day completion — for ALL users AND paid-only
    const milestones = [1, 2, 3, 7, 10, 15, 30, 45, 60];
    for (const day of milestones) {
      if (userAgeDays < day) continue; // not yet eligible
      if (!dayCompletion[day]) dayCompletion[day] = { completed: 0, total: 0 };
      if (!dayCompletionPaidOnly[day]) dayCompletionPaidOnly[day] = { completed: 0, total: 0 };
      dayCompletion[day].total++;
      if (category !== "no_evidence" && !isTrialActive && !isTrialCancelled) {
        dayCompletionPaidOnly[day].total++;
      }
      const dayProgress = progress?.[`day${day}`];
      const completed = Array.isArray(dayProgress) && dayProgress.length > 0
        && dayProgress.every((e: any) => e.is_completed === true);
      if (completed) {
        dayCompletion[day].completed++;
        if (category !== "no_evidence" && !isTrialActive && !isTrialCancelled) {
          dayCompletionPaidOnly[day].completed++;
        }
      }
    }
  }

  console.log(`\n=== Breakdown of ${allSnap.size} "purchased" users ===`);
  console.log(`  Deleted users:                ${deleted}`);
  console.log(`  TRIAL active (not paid yet):  ${trialActive}`);
  console.log(`  TRIAL cancelled:              ${trialCancelled}`);
  console.log(`  Razorpay paid:                ${razorpayPaid}`);
  console.log(`  App Store (via RC):           ${appStorePaid}`);
  console.log(`  Open account (comp):          ${openAccount}`);
  console.log(`  VIP type:                     ${vipPaid}`);
  console.log(`  No payment evidence:          ${noPaymentEvidence}  ← likely old/incomplete`);
  console.log(`  ────────────────`);
  console.log(`  Legit paid (Razorpay+App+Open+VIP): ${legitPaid}`);

  console.log(`\n=== Engagement ===`);
  console.log(`  With progress data:   ${hasProgress}`);
  console.log(`  Zero progress:        ${hasNoProgress}  ← signed up + got start_date but NEVER opened app`);

  console.log(`\n=== Day retention — ALL users (current dashboard) ===`);
  for (const day of [1, 2, 3, 7, 10, 15, 30, 45, 60]) {
    const m = dayCompletion[day];
    if (!m || m.total === 0) continue;
    const pct = Math.round((m.completed / m.total) * 100);
    console.log(`  Day ${day.toString().padStart(2)}: ${pct.toString().padStart(2)}%  (${m.completed}/${m.total})`);
  }

  console.log(`\n=== Day retention — paid only (excluding trial + no-evidence) ===`);
  for (const day of [1, 2, 3, 7, 10, 15, 30, 45, 60]) {
    const m = dayCompletionPaidOnly[day];
    if (!m || m.total === 0) continue;
    const pct = Math.round((m.completed / m.total) * 100);
    console.log(`  Day ${day.toString().padStart(2)}: ${pct.toString().padStart(2)}%  (${m.completed}/${m.total})`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
