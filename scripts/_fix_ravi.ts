import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "B35e9PzXfmcPx4UbrFiCFuJGbPt1";
const EMAIL = "ravikiran.576@gmail.com";
const RC_KEY = process.env.RC_API_SECRET_KEY!;

function buildStartDateIST(now: Date) {
  const date = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
  const time = now.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
  }).toUpperCase();
  return { date, time, timezone: "IST", timeZoneOffsetInMins: 330 };
}

(async () => {
  // 1. Grant RC 3-month entitlement
  const subUrl = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(UID)}`;
  await fetch(subUrl, { headers: { Authorization: `Bearer ${RC_KEY}` } });
  const grantUrl = `${subUrl}/entitlements/stoppage_treatment/promotional`;
  const res = await fetch(grantUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RC_KEY}` },
    body: JSON.stringify({ duration: "three_month" }),
  });
  const txt = await res.text();
  console.log(`RC grant: ${res.status} ${res.ok ? "OK" : "FAIL"}`);
  if (!res.ok) console.log(`  ${txt}`);

  // 2. Merge paid-user fields onto existing Firestore doc
  await db.collection("Users").doc(UID).set({
    user_type: "freev2",
    treatment_stage: "FREE_STOPPAGE",
    extra_user_tags: ["paidStoppage"],
    eligible_for_special_regrowth_features: true,
    userLocalTimeZone: "Asia/Kolkata",
    onboarding_flow_version: "B",
    is_deleted: false,
    starter_photos_submit_showed_once: true,
    starter_photos_submit_submitted_once: true,
    start_date: buildStartDateIST(new Date()),
    progress: {},
    wp_user: {
      ID: UID,
      user_email: EMAIL,
      display_name: "",
      purchase_types: [],
    },
    plan: "threeMonth",
    payment_provider: "razorpay",
    paid_at: FieldValue.serverTimestamp(),
    lead_status: "converted",
    modified_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`✓ Firestore Users/${UID} updated`);
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
