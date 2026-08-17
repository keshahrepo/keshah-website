import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db.collection("Users").where("referral_source", "==", "educator_jennifer").get();

  let total = 0;
  let startedOnboarding = 0;       // start_date set (trial OR paid)
  let paidStoppage = 0;            // extra_user_tags includes "paidStoppage" → actually paid
  let trialActive = 0;             // trial_status = active
  let regrowthPurchased = 0;       // regrowth_treatment_purchased
  let scalpKit = 0;                // scalp_health_support_purchased

  const buyers: { email: string; gender: string; geo: string; paidStoppage: boolean; trial: boolean; signedUp: string }[] = [];

  snap.forEach((doc) => {
    const d = doc.data();
    if (d.is_deleted) return;
    total++;
    const tags = Array.isArray(d.extra_user_tags) ? d.extra_user_tags : [];
    const isPaid = tags.includes("paidStoppage");
    const isTrial = d.trial_status === "active";
    if (d.start_date) startedOnboarding++;
    if (isPaid) paidStoppage++;
    if (isTrial) trialActive++;
    if (d.regrowth_treatment_purchased) regrowthPurchased++;
    if (d.scalp_health_support_purchased) scalpKit++;

    if (d.start_date) {
      buyers.push({
        email: d.email || "(no email)",
        gender: d.selected_gender || "?",
        geo: d.userLocalTimeZone || "?",
        paidStoppage: isPaid,
        trial: isTrial,
        signedUp: d.created_at?.toDate?.()?.toISOString().slice(0, 10) || "?",
      });
    }
  });

  console.log(`\n=== Jennifer — purchase breakdown ===`);
  console.log(`Total signups:                   ${total}`);
  console.log(`Started onboarding (trial+paid): ${startedOnboarding}  ← what I was calling "converted"`);
  console.log(`Actually paid (paidStoppage):    ${paidStoppage}`);
  console.log(`Active trial right now:          ${trialActive}`);
  console.log(`Regrowth kit purchased:          ${regrowthPurchased}`);
  console.log(`Scalp health kit purchased:      ${scalpKit}`);

  console.log(`\n=== The ${startedOnboarding} who started onboarding ===`);
  buyers
    .sort((a, b) => (a.signedUp < b.signedUp ? -1 : 1))
    .forEach((b, i) => {
      const status = b.paidStoppage ? "PAID" : b.trial ? "TRIAL" : "started but not flagged paid/trial";
      console.log(
        `  ${String(i + 1).padStart(2)}. ${b.signedUp}  ${b.gender.padEnd(7)} ${b.geo.padEnd(20)} ${status.padEnd(40)} ${b.email}`
      );
    });

  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
