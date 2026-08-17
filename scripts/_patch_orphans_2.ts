// Patches the 3 additional orphan Razorpay subs found by _audit_orphan_rzp.ts
// that have a Firestore user doc matchable by email.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = "sk_vpNXbCCTXbuJaBvpGpFeYzRefSghx"; // prod V1-compat key

const ROWS = [
  {
    email: "tippudsultan@gmail.com",
    uid: "wYhNUQXlw8N1jTLLqyow7Vm3hY93",
    sub: "sub_ShLb2kWLW70CCN",
    plan: "threeMonth",
    duration: "three_month",
    status: "paused",
  },
  {
    email: "uyanuj2@gmail.com",
    uid: "lQxuJ2JBCNTrnoY0GE0WMVqxogf1",
    sub: "sub_Sg3pgjao7JLLMf",
    plan: "threeMonth",
    duration: "three_month",
    status: "cancelled",
  },
  {
    email: "aashaynalawade@gmail.com",
    uid: "baFt3gHRq8WM8jPyfsknUAviFrc2",
    sub: "sub_SfyebMo80sggCK",
    plan: "threeMonth",
    duration: "three_month",
    status: "active",
  },
];

const RZP_AUTH = "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");

async function rzpPayment(subId: string) {
  const r = await fetch(`https://api.razorpay.com/v1/subscriptions/${subId}`, { headers: { Authorization: RZP_AUTH } });
  const j: any = await r.json();
  return { paidAt: j.current_start ?? j.start_at, subData: j };
}

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

    const { paidAt } = await rzpPayment(r.sub);

    await db.collection("Users").doc(r.uid).set(
      {
        razorpay_subscription_id: r.sub,
        razorpay_plan: r.plan,
        plan: r.plan,
        payment_provider: "razorpay",
        paid_at: new Date((paidAt ?? Math.floor(Date.now() / 1000)) * 1000),
        extra_user_tags: FieldValue.arrayUnion("paidStoppage"),
      },
      { merge: true }
    );
    console.log(`  ✓ Firestore linked`);

    try {
      await rcGrant(r.uid, r.duration);
      console.log(`  ✓ RC entitlement granted (${r.duration})`);
    } catch (e: any) {
      console.log(`  ✗ RC grant failed: ${e.message}`);
    }
  }
  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
