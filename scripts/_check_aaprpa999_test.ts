// Verify the post-purchase sign-in flow actually seeded correctly.
// Look up aaprpa999@gmail.com in Firebase + Firestore + RC.
//
// Usage: npx tsx scripts/_check_aaprpa999_test.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const EMAIL = "aaprpa999@gmail.com";

async function main() {
  console.log(`\n=== Checking ${EMAIL} ===\n`);

  // Firebase Auth
  let uid: string | null = null;
  try {
    const user = await auth.getUserByEmail(EMAIL);
    uid = user.uid;
    console.log(`Firebase Auth uid: ${uid}`);
    console.log(`  Created: ${user.metadata.creationTime}`);
    console.log(
      `  Providers: ${user.providerData.map((p) => p.providerId).join(", ")}`,
    );
  } catch {
    console.log("Firebase Auth: NOT FOUND");
    return;
  }

  // Firestore
  const userDoc = await db.collection("Users").doc(uid!).get();
  console.log(`\nFirestore Users/${uid}: ${userDoc.exists ? "EXISTS" : "MISSING"}`);
  if (userDoc.exists) {
    const d = userDoc.data() ?? {};
    console.log(`  user_type: ${d.user_type}`);
    console.log(`  extra_user_tags: ${JSON.stringify(d.extra_user_tags)}`);
    console.log(`  treatment_stage: ${d.treatment_stage}`);
    console.log(`  paid_at: ${d.paid_at?.toDate?.() ?? d.paid_at}`);
    console.log(`  trial_ends_at: ${d.trial_ends_at?.toDate?.() ?? d.trial_ends_at}`);
    console.log(`  starter_photos_submit_submitted_once: ${d.starter_photos_submit_submitted_once}`);
    console.log(`  start_date: ${JSON.stringify(d.start_date)}`);
  }

  // PaidWebSessions — any claimed by this uid?
  const pws = await db
    .collection("PaidWebSessions")
    .where("claimed_by_uid", "==", uid)
    .get();
  console.log(`\nPaidWebSessions claimed by ${uid}: ${pws.size}`);
  pws.forEach((d) => {
    const data = d.data();
    console.log(
      `  ${d.id}: sub=${data.subscription_id}, rc_ok=${data.rc_receipt_ok}, provider=${data.claimed_provider_id}`,
    );
  });

  // RC subscriber
  const rcRes = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid!)}`,
    { headers: { Authorization: `Bearer ${RC_KEY}` } },
  );
  const rcJson = (await rcRes.json().catch(() => ({}))) as Record<string, unknown>;
  console.log(`\nRC subscriber ${uid}: HTTP ${rcRes.status}`);
  if (rcJson.subscriber) {
    const sub = rcJson.subscriber as Record<string, unknown>;
    const ents = (sub.entitlements ?? {}) as Record<string, unknown>;
    const subs = (sub.subscriptions ?? {}) as Record<string, unknown>;
    console.log(`  Entitlements: ${Object.keys(ents).join(", ") || "(none)"}`);
    for (const [k, v] of Object.entries(ents)) {
      const e = v as Record<string, unknown>;
      console.log(
        `    ${k}: expires=${e.expires_date}, product=${e.product_identifier}`,
      );
    }
    console.log(`  Subscriptions: ${Object.keys(subs).join(", ") || "(none)"}`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
