import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "aGkPL6PypxcQBn3PDlRzQ2b2iA63";
const EMAIL = "niranjantrivedi2898@gmail.com";

// Build IST start_date in the exact format the mobile app expects
function buildStartDateIST(now: Date) {
  const date = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
  const time = now.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
  }).toUpperCase();
  return { date, time, timezone: "IST", timeZoneOffsetInMins: 330 };
}

const DRY_RUN = process.argv.includes("--dry-run");

(async () => {
  // RC grant first
  const rcKey = process.env.RC_API_SECRET_KEY_V1 || process.env.RC_API_SECRET_KEY;
  if (!rcKey) {
    console.log("⚠️  No RC key in env — skipping RC grant. Will need manual grant.");
  }

  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log(`Target UID: ${UID}`);
  console.log(`Email: ${EMAIL}`);
  console.log("");

  // 1. Grant RC 3-month entitlement via promotional API
  if (!DRY_RUN && rcKey) {
    const subUrl = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(UID)}`;
    // Ensure subscriber exists
    await fetch(subUrl, { headers: { Authorization: `Bearer ${rcKey}` } });
    const grantUrl = `${subUrl}/entitlements/stoppage_treatment/promotional`;
    const res = await fetch(grantUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${rcKey}` },
      body: JSON.stringify({ duration: "three_month" }),
    });
    const txt = await res.text();
    console.log(`RC grant: ${res.status} ${res.ok ? "OK" : "FAIL"}`);
    if (!res.ok) console.log(`  ${txt}`);
  }

  // 2. Create Users doc
  const update = {
    email: EMAIL,
    providerId: "google.com",
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
    created_at: FieldValue.serverTimestamp(),
    modified_at: FieldValue.serverTimestamp(),
    // Note: razorpay_subscription_id not set — fill in later if found
  };

  if (DRY_RUN) {
    console.log("Would write:", JSON.stringify(update, null, 2));
  } else {
    await db.collection("Users").doc(UID).set(update, { merge: true });
    console.log(`✓ Firestore Users/${UID} created`);
  }

  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
