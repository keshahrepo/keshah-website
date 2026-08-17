// Patches 3 users whose Razorpay subscriptions were orphaned (paid as
// anon, then signed in with Google — new UID, no linkage). Writes the
// sub ID + paid_at onto their Google UID doc AND grants RC entitlement
// for the remaining paid period.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const ROWS = [
  {
    email: "siddgarud1999@gmail.com",
    uid: "yASx0UHqAYRj8rEcHclW3Vy3iW63",
    sub: "sub_SgzV3syPaqQ0Z3",
    pay: "pay_SgzVOSnpnp9oKe",
    plan: "threeMonth",
    duration: "three_month",
    paidAtSec: 1776959749,
    status: "active",
  },
  {
    email: "mojibzzzzz@gmail.com",
    uid: "E5k4b3gKM1Obv2aOwRgEJzPdo2s2",
    sub: "sub_SgmNAtwq1LAVPz",
    pay: "pay_SgmNiysTE2Fp6q",
    plan: "threeMonth",
    duration: "three_month",
    paidAtSec: 1776913518,
    status: "cancelled",
  },
  {
    email: "kdhenge@gmail.com",
    uid: "HYzoCxFdffa5g1QXUnBCgfmrSaL2",
    sub: "sub_SgOB0bhjz64GQw",
    pay: "pay_SgOBLm8J0FWj9B",
    plan: "threeMonth",
    duration: "three_month",
    paidAtSec: 1776828295,
    status: "active",
  },
];

async function rcGrant(uid: string, duration: string) {
  const base = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`;
  await fetch(base, { headers: { Authorization: `Bearer ${RC_KEY}` } });
  const res = await fetch(`${base}/entitlements/stoppage_treatment/promotional`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RC_KEY}` },
    body: JSON.stringify({ duration }),
  });
  if (!res.ok) throw new Error(`RC grant ${res.status}: ${await res.text()}`);
}

(async () => {
  for (const r of ROWS) {
    console.log(`\n═══ ${r.email} (${r.uid}) ═══`);
    console.log(`  sub=${r.sub} status=${r.status}`);

    await db.collection("Users").doc(r.uid).set(
      {
        razorpay_subscription_id: r.sub,
        razorpay_plan: r.plan,
        razorpay_payment_id: r.pay,
        plan: r.plan,
        payment_provider: "razorpay",
        paid_at: new Date(r.paidAtSec * 1000),
        extra_user_tags: FieldValue.arrayUnion("paidStoppage"),
      },
      { merge: true }
    );
    console.log(`  ✓ Firestore updated`);

    try {
      await rcGrant(r.uid, r.duration);
      console.log(`  ✓ RC entitlement granted (${r.duration})`);
    } catch (e: any) {
      console.log(`  ✗ RC grant failed: ${e.message}`);
    }
  }
  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
