// Delete aaditya.agrawal36@gmail.com — Firebase user + Firestore doc +
// RC subscriber + any active Stripe subs — so it can be reused as a
// fresh test account.
//
// Usage:
//   set -a && source .env.local && set +a
//   CONFIRM=1 npx tsx scripts/_delete_aaditya_test_account.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import Stripe from "stripe";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const EMAIL = "aaditya.agrawal36@gmail.com";

async function rcDelete(uid: string): Promise<string> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${RC_KEY}` } },
  );
  return res.ok ? "ok" : `HTTP ${res.status}`;
}

async function main() {
  console.log(`\nCleaning ${EMAIL}...\n`);

  // 1. Firebase Auth
  let uid: string | null = null;
  try {
    const user = await auth.getUserByEmail(EMAIL);
    uid = user.uid;
    console.log(`Firebase Auth uid: ${uid}`);
    console.log(
      `  providers: ${user.providerData.map((p) => `${p.providerId}(${p.email})`).join(", ")}`,
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") throw err;
    console.log("Firebase Auth: no user with that email.");
  }

  // Also search by email in Firestore Users — in case a user doc exists
  // with a different uid (e.g. Apple provider with a relay email).
  const userDocIds = new Set<string>();
  if (uid) userDocIds.add(uid);
  const byEmail = await db
    .collection("Users")
    .where("email", "==", EMAIL)
    .get();
  byEmail.forEach((d) => userDocIds.add(d.id));

  // 2. Stripe — customers + subscriptions
  const customers = await stripe.customers.list({ email: EMAIL, limit: 100 });
  console.log(`Stripe customers with email: ${customers.data.length}`);
  const stripeSubsToCancel: Array<{ subId: string; status: string }> = [];
  for (const c of customers.data) {
    const subs = await stripe.subscriptions.list({
      customer: c.id,
      status: "all",
      limit: 100,
    });
    for (const s of subs.data) {
      if (["trialing", "active", "past_due", "incomplete"].includes(s.status)) {
        stripeSubsToCancel.push({ subId: s.id, status: s.status });
      }
    }
  }

  // 3. PaidWebSessions
  const pwsQuery = await db
    .collection("PaidWebSessions")
    .where("email", "==", EMAIL)
    .get();
  const pwsIds: string[] = [];
  pwsQuery.forEach((d) => pwsIds.push(d.id));

  console.log(`\n─── PLAN ───`);
  console.log(`Firebase Auth uid to delete: ${uid ?? "(none)"}`);
  console.log(`Firestore Users docs: ${[...userDocIds].join(", ") || "(none)"}`);
  console.log(`Stripe subs to cancel: ${stripeSubsToCancel.map((s) => s.subId).join(", ") || "(none)"}`);
  console.log(`PaidWebSessions to delete: ${pwsIds.join(", ") || "(none)"}`);

  if (process.env.CONFIRM !== "1") {
    console.log(`\nRe-run with CONFIRM=1 to actually delete.`);
    return;
  }

  console.log(`\n─── EXECUTING ───`);

  for (const s of stripeSubsToCancel) {
    try {
      await stripe.subscriptions.cancel(s.subId);
      console.log(`  ✓ cancelled Stripe sub ${s.subId} (was ${s.status})`);
    } catch (e) {
      console.error(`  ✗ Stripe cancel ${s.subId} failed:`, e);
    }
  }

  for (const id of userDocIds) {
    await db.collection("Users").doc(id).delete();
    console.log(`  ✓ deleted Users/${id}`);
    const rcResult = await rcDelete(id);
    console.log(`  ✓ RC subscriber ${id} → ${rcResult}`);
  }

  for (const id of pwsIds) {
    await db.collection("PaidWebSessions").doc(id).delete();
    console.log(`  ✓ deleted PaidWebSessions/${id}`);
  }

  if (uid) {
    await auth.deleteUser(uid);
    console.log(`  ✓ deleted Firebase Auth user ${uid}`);
  }

  console.log(`\nDone. ${EMAIL} is clean.`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
