// Export the actual 230 BEST customers (≥30 days routine completed).
// No RC dependency — just Firestore.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { writeFileSync } from "fs";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const DAY_MS = 86400000;

(async () => {
  const now = Date.now();

  console.log("Pulling all paidStoppage users...");
  const snap = await db.collection("Users")
    .where("extra_user_tags", "array-contains", "paidStoppage")
    .get();
  const all = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Total: ${all.length}`);

  const profiles: Array<Record<string, unknown>> = [];
  for (const d of all) {
    const data = d.data();
    const progress = (data.progress ?? {}) as Record<string, unknown[]>;
    const completedDays: number[] = [];
    for (const k of Object.keys(progress)) {
      if (!k.startsWith("day")) continue;
      const n = parseInt(k.slice(3), 10);
      if (!Number.isFinite(n)) continue;
      if (Array.isArray(progress[k]) && progress[k].length > 0) completedDays.push(n);
    }
    const totalDaysCompleted = completedDays.length;
    const maxDay = totalDaysCompleted > 0 ? Math.max(...completedDays) : 0;
    const wk1Days = completedDays.filter(d => d <= 7).length;
    const wk2Days = completedDays.filter(d => d >= 8 && d <= 14).length;
    const wk34Days = completedDays.filter(d => d >= 15 && d <= 30).length;

    // Tenure from earliest available timestamp (paid_at or created_at)
    const paidAtMs = data.paid_at?.toDate?.()?.getTime?.() ?? null;
    const createdAtMs = data.created_at?.toDate?.()?.getTime?.() ?? null;
    const firstPaidAtMs = data.first_paid_at?.toDate?.()?.getTime?.() ?? null;
    const earliestMs = firstPaidAtMs ?? paidAtMs ?? createdAtMs ?? null;
    const tenureDays = earliestMs ? Math.floor((now - earliestMs) / DAY_MS) : null;
    const consistencyRate = tenureDays && tenureDays > 0
      ? Number((totalDaysCompleted / tenureDays).toFixed(3))
      : null;

    const phone = data.phone_number ?? data.phone;
    const country = (phone as { country_code?: string })?.country_code ?? null;

    profiles.push({
      uid: d.id,
      email: data.email ?? null,
      tenureDays,
      totalDaysCompleted,
      maxDay,
      wk1Days,
      wk2Days,
      wk34Days,
      consistencyRate,
      country,
      gender: data.selected_gender ?? null,
      hairLossLocation: data.hair_loss_location ?? null,
      hairGoal: data.hair_goal ?? null,
      commitmentAnswer: data.commitment_answer ?? null,
      signupSource: data.signup_source ?? null,
      referralSource: data.referral_source ?? null,
      plan: data.plan ?? null,
      paymentProvider: data.payment_provider ?? null,
      supportNeeds: Array.isArray(data.support_needs) ? data.support_needs as string[] : [],
      treatmentsTried: Array.isArray(data.treatments_tried) ? data.treatments_tried as string[] : [],
      dailyLearningDay: data.daily_learning_completed_day ?? 0,
      hasRazorpaySub: !!data.razorpay_subscription_id,
      hasStripeCustomer: !!data.stripe_customer_id,
      treatmentStage: data.treatment_stage ?? null,
      providerId: data.providerId ?? null,
    });
  }

  const best = profiles.filter(p => (p.totalDaysCompleted as number) >= 30);
  // FAILED definition: paid users with <10 days routine, tenure ≥30 days
  const failed = profiles.filter(p => {
    const t = p.totalDaysCompleted as number;
    const td = p.tenureDays as number | null;
    return t < 10 && td != null && td >= 30;
  });

  console.log(`\nBEST   (≥30 days completed):  ${best.length}`);
  console.log(`FAILED (<10 days, tenure ≥30): ${failed.length}`);

  writeFileSync("/tmp/best_customer_cohort.json", JSON.stringify({
    generated_at: new Date().toISOString(),
    best, failed, all: profiles,
  }, null, 2));
  console.log("Written: /tmp/best_customer_cohort.json");

  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });
