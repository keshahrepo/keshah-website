// Grant Kushal free access (financial-struggles request, 2026-06-23):
//   1. Firestore: open_account=true (canonical paywall bypass for FreeV2)
//   2. RC: promotional stoppage_treatment entitlement (yearly)
//
// Run: set -a && source .env.local && set +a && npx tsx scripts/_grant_kushal.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const EMAIL = "kushal.proxy@gmail.com";
const UID = "fDDR2gzHG0QXHEq0XRdl8Qzu3up2";
const ENTITLEMENT = "stoppage_treatment";

(async () => {
  // 1. Firestore: open_account=true
  console.log(`▸ Firestore update`);
  const ref = db.collection("Users").doc(UID);
  const before = (await ref.get()).data();
  if (!before) {
    console.log(`  ✗ no doc at ${UID}, aborting`);
    process.exit(1);
  }
  await ref.update({
    open_account: true,
    modified_at: FieldValue.serverTimestamp(),
  });
  console.log(`  ✓ open_account: true (uid: ${UID})`);

  // 2. RC promotional entitlement
  console.log(`\n▸ RevenueCat promotional grant`);
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(UID)}/entitlements/${ENTITLEMENT}/promotional`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RC_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ duration: "yearly" }),
    }
  );
  const body = await res.text();
  if (!res.ok) {
    console.log(`  ✗ RC grant failed: HTTP ${res.status}`);
    console.log(`    ${body}`);
    process.exit(1);
  }
  console.log(`  ✓ ${ENTITLEMENT} granted (yearly)`);

  // 3. Verify
  console.log(`\n▸ Verification`);
  const verifyRes = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(UID)}`,
    { headers: { Authorization: `Bearer ${RC_KEY}` } }
  );
  const sub: any = await verifyRes.json();
  const ent = sub?.subscriber?.entitlements?.[ENTITLEMENT];
  if (ent) {
    const expires = new Date(ent.expires_date).toISOString();
    const active = new Date(ent.expires_date).getTime() > Date.now();
    console.log(`  ✓ RC ${ENTITLEMENT}: expires ${expires} ${active ? "(ACTIVE)" : "(EXPIRED)"}`);
  } else {
    console.log(`  ⚠ RC verification: ${ENTITLEMENT} not found on subscriber after grant`);
  }
  console.log(`\nDone. ${EMAIL} should have access after next app launch / RC refresh.`);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
