// Sawai (sawaisuthar5@gmail.com) — India/Razorpay user, day 101 FREE_STOPPAGE.
// He got 2× ₹999 refunds already; now asking to unsubscribe.
//
// Dry-run first — pass --apply to cancel Razorpay sub + update Firestore + send msg.
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_cancel_sawai.ts           # inspect
//   npx tsx scripts/_cancel_sawai.ts --apply   # cancel + confirm

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const EMAIL = "sawaisuthar5@gmail.com";
const APPLY = process.argv.includes("--apply");

const CONFIRM_MESSAGE =
  `Hey Sawai — your subscription has been cancelled on our end. You won't be charged again.\n\n` +
  `You'll continue to have access until the end of your current billing cycle, then the app will move you to the free plan automatically. You don't need to delete your account.\n\n` +
  `Thanks for giving KESHAH a try. If you ever want to come back, you're welcome anytime.`;

(async () => {
  console.log(`▸ Lookup: ${EMAIL}`);
  const snap = await db.collection("Users").where("email", "==", EMAIL).limit(1).get();
  if (snap.empty) { console.log("  ✗ not found"); process.exit(1); }
  const UID = snap.docs[0].id;
  const x = snap.docs[0].data() as any;
  console.log(`  ✓ UID: ${UID}`);

  // Print any subscription-related fields we can find
  const relevantFields = [
    "treatment_stage", "razorpay_subscription_id", "razorpay_customer_id",
    "subscription_status", "subscription_cancelled_at", "subscription_provider",
    "revenuecat_id", "start_date", "converted_at", "region", "country",
    "razorpay_kit_payment_id", "regrowth_kit_payment_provider",
    "razorpay_plan_id", "current_period_end", "billing_cycle",
  ];
  console.log(`\n  Subscription-related fields:`);
  for (const f of relevantFields) {
    if (x[f] !== undefined) console.log(`    ${f}: ${JSON.stringify(x[f])}`);
  }

  // Also scan for any field containing "razorpay" or "subscription" or "sub_"
  console.log(`\n  All fields matching /sub|razorpay|refund/:`);
  for (const [k, v] of Object.entries(x)) {
    if (/sub|razorpay|refund/i.test(k) && !relevantFields.includes(k)) {
      console.log(`    ${k}: ${JSON.stringify(v)}`);
    }
  }

  const subId = x.razorpay_subscription_id || x.subscription_id;
  if (!subId) {
    console.log(`\n  ✗ No Razorpay subscription ID found. Manual check needed (RevenueCat / App Store / Play Store subscription?).`);
    process.exit(1);
  }
  console.log(`\n▸ Subscription to cancel: ${subId}`);

  if (!APPLY) {
    console.log(`\n  (dry-run — pass --apply to cancel via Razorpay)`);
    process.exit(0);
  }

  const keyId = process.env.RAZORPAY_KEY_ID!;
  const keySecret = process.env.RAZORPAY_KEY_SECRET!;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${subId}/cancel`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_at_cycle_end: 0 }),
  });
  const body = await res.json();
  console.log(`  Razorpay status: ${res.status}`);
  console.log(`  Razorpay response: ${JSON.stringify(body, null, 2)}`);

  if (res.status >= 200 && res.status < 300) {
    await db.collection("Users").doc(UID).update({
      subscription_cancelled_at: FieldValue.serverTimestamp(),
      subscription_status: "cancelled",
      modified_at: FieldValue.serverTimestamp(),
    });
    console.log(`  ✓ Firestore updated`);

    await db.collection("support").doc(UID).collection("messages").add({
      fromId: "0",
      content: CONFIRM_MESSAGE,
      attachments: null,
      feedback: null,
      type: "direct",
      timestamp: Timestamp.now(),
    });
    console.log(`  ✓ confirmation message sent`);
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
