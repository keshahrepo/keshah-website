// One-off: delete aaprpa999@gmail.com's Firebase user + Firestore doc +
// RC subscriber so Aadi can use the same Apple ID to re-test the new
// post-purchase sign-in flow on prod. Not destructive to real users
// (single email hardcoded).
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_delete_aaprpa999_test_account.ts

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

async function rcDelete(uid: string): Promise<{ ok: boolean; body: string }> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${RC_KEY}` } },
  );
  const body = await res.text().catch(() => "");
  return { ok: res.ok, body };
}

async function main() {
  console.log(`Looking up ${EMAIL}...`);

  // 1. Firebase Auth — get user by email
  let uid: string | null = null;
  try {
    const user = await auth.getUserByEmail(EMAIL);
    uid = user.uid;
    console.log(`  Firebase Auth uid: ${uid}`);
    console.log(
      `  Providers:`,
      user.providerData.map((p) => `${p.providerId} (${p.email ?? p.uid})`),
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/user-not-found") {
      console.log("  No Firebase Auth user with that email.");
    } else {
      throw err;
    }
  }

  // 2. Firestore — Users doc + also query by email for any orphans
  const emailQuery = await db
    .collection("Users")
    .where("email", "==", EMAIL)
    .get();
  const orphanIds = new Set<string>();
  emailQuery.forEach((d) => orphanIds.add(d.id));
  if (uid) orphanIds.add(uid);
  console.log(`  Firestore Users docs to delete: ${[...orphanIds].join(", ") || "(none)"}`);

  // 3. RevenueCat — delete subscriber for each candidate uid
  const rcResults: Record<string, string> = {};
  for (const id of orphanIds) {
    const r = await rcDelete(id);
    rcResults[id] = r.ok ? "deleted" : `error: ${r.body.slice(0, 120)}`;
  }
  console.log(`  RC deletes:`, rcResults);

  // 4. Also check PaidWebSessions — any unclaimed sessions for this email?
  const pwsQ = await db
    .collection("PaidWebSessions")
    .where("email", "==", EMAIL)
    .get();
  console.log(`  PaidWebSessions found for email: ${pwsQ.size}`);
  const pwsIds: string[] = [];
  pwsQ.forEach((d) => pwsIds.push(d.id));

  // Confirm before nuking
  console.log("\n─── DRY SUMMARY ───");
  console.log(`Firebase uid: ${uid ?? "(none)"}`);
  console.log(`Firestore Users docs: ${[...orphanIds].join(", ") || "(none)"}`);
  console.log(`RC subscribers: ${Object.keys(rcResults).join(", ") || "(none)"}`);
  console.log(`PaidWebSessions to delete: ${pwsIds.join(", ") || "(none)"}`);

  if (process.env.CONFIRM !== "1") {
    console.log("\nRe-run with CONFIRM=1 to actually delete.");
    process.exit(0);
  }

  console.log("\n─── DELETING ───");

  // Firestore delete
  for (const id of orphanIds) {
    await db.collection("Users").doc(id).delete();
    console.log(`  ✓ deleted Users/${id}`);
  }
  for (const id of pwsIds) {
    await db.collection("PaidWebSessions").doc(id).delete();
    console.log(`  ✓ deleted PaidWebSessions/${id}`);
  }

  // Firebase Auth delete (do this last — after everything else is cleaned)
  if (uid) {
    await auth.deleteUser(uid);
    console.log(`  ✓ deleted Firebase Auth user ${uid}`);
  }

  console.log("\nDone. You can now sign in with this Apple ID fresh.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
