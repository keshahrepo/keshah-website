import admin from "firebase-admin";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
let serviceAccount;
try { serviceAccount = JSON.parse(raw); }
catch { serviceAccount = JSON.parse(Buffer.from(raw, "base64").toString("utf-8")); }
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();
const RC_KEY = process.env.RC_API_SECRET_KEY;

const DRY_RUN = !process.argv.includes("--apply");
console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);

// 1. PendingRcAliases — drain
console.log("\n=== PendingRcAliases scan ===");
const pendingSnap = await db.collection("PendingRcAliases").get();
console.log(`Total pending: ${pendingSnap.size}`);

const drainable = [];
const orphan = [];

for (const doc of pendingSnap.docs) {
  const d = doc.data();
  const email = d.email;
  const anonId = d.anonAppUserId;
  if (!email || !anonId) continue;

  // Check if a Firebase Auth user exists for this email
  let authUid = null;
  try { authUid = (await auth.getUserByEmail(email)).uid; } catch {}

  if (authUid) {
    // Verify the Firebase UID DOESN'T already have the entitlement
    const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(authUid)}`, {
      headers: { Authorization: `Bearer ${RC_KEY}`, "X-Platform": "stripe" },
    });
    let alreadyHas = false;
    if (r.ok) {
      const data = await r.json();
      const ents = data.subscriber?.entitlements ?? {};
      alreadyHas = Object.entries(ents).some(([_, v]) =>
        !v.expires_date || new Date(v.expires_date) > new Date()
      );
    }
    drainable.push({ pendingDocId: doc.id, anonId, authUid, email, alreadyHas });
  } else {
    orphan.push({ pendingDocId: doc.id, anonId, email });
  }
}

console.log(`\nDrainable (Firebase user exists): ${drainable.length}`);
console.log(`  Already has entitlement (no-op): ${drainable.filter(d => d.alreadyHas).length}`);
console.log(`  Needs alias: ${drainable.filter(d => !d.alreadyHas).length}`);
console.log(`Orphans (no Firebase user yet — leave in pending): ${orphan.length}`);

if (DRY_RUN) {
  console.log("\nFirst 10 needing alias:");
  for (const d of drainable.filter(x => !x.alreadyHas).slice(0, 10)) {
    console.log(`  ${d.email}: ${d.anonId} → ${d.authUid}`);
  }
  console.log("\nRe-run with --apply to alias.");
  process.exit(0);
}

// APPLY mode
let aliased = 0, failed = 0, deleted = 0;
for (const d of drainable) {
  if (!d.alreadyHas) {
    const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(d.anonId)}/alias`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RC_KEY}`,
        "Content-Type": "application/json",
        "X-Platform": "stripe",
      },
      body: JSON.stringify({ new_app_user_id: d.authUid }),
    });
    if (r.ok) {
      aliased++;
      console.log(`[OK ] ${d.email}: ${d.anonId} → ${d.authUid}`);
    } else {
      failed++;
      console.log(`[ERR] ${d.email}: ${r.status} ${(await r.text()).slice(0, 100)}`);
      continue;
    }
  }
  // Whether already-had or just-aliased, the pending record is resolved
  await db.collection("PendingRcAliases").doc(d.pendingDocId).delete();
  deleted++;
}
console.log(`\n=== Summary ===`);
console.log(`Aliased: ${aliased}, already-had: ${drainable.filter(d => d.alreadyHas).length}, failed: ${failed}, pending records deleted: ${deleted}`);
console.log(`Orphans remaining (no Firebase user): ${orphan.length}`);
process.exit(0);
