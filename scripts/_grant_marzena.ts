// Grant Marzena creator access (2026-06-25):
//   1. Firestore: open_account=true (paywall bypass for FreeV2)
//   2. RC: promotional stoppage_treatment entitlement (yearly)
//
// Run: set -a && source .env.local && set +a && npx tsx scripts/_grant_marzena.ts

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

const EMAIL = "marzena@keshah.com";
const UID = "cNWJsSx1GChhossyMGA4DkLFkXZ2";
const ENTITLEMENT = "stoppage_treatment";

(async () => {
  console.log(`▸ Firestore update`);
  const ref = db.collection("Users").doc(UID);
  if (!(await ref.get()).exists) { console.log(`  ✗ no doc at ${UID}`); process.exit(1); }
  await ref.update({ open_account: true, modified_at: FieldValue.serverTimestamp() });
  console.log(`  ✓ open_account: true (uid: ${UID})`);

  console.log(`\n▸ RevenueCat promotional grant`);
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(UID)}/entitlements/${ENTITLEMENT}/promotional`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${RC_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ duration: "yearly" }),
    }
  );
  const body = await res.text();
  if (!res.ok) { console.log(`  ✗ RC grant failed: HTTP ${res.status}\n    ${body}`); process.exit(1); }
  console.log(`  ✓ ${ENTITLEMENT} granted (yearly)`);

  console.log(`\n▸ Verification`);
  const v = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(UID)}`,
    { headers: { Authorization: `Bearer ${RC_KEY}` } }
  );
  const sub: any = await v.json();
  const ent = sub?.subscriber?.entitlements?.[ENTITLEMENT];
  if (ent) {
    const expires = new Date(ent.expires_date).toISOString();
    const active = new Date(ent.expires_date).getTime() > Date.now();
    console.log(`  ✓ RC ${ENTITLEMENT}: expires ${expires} ${active ? "(ACTIVE)" : "(EXPIRED)"}`);
  } else {
    console.log(`  ⚠ RC verification: ${ENTITLEMENT} not found after grant`);
  }
  console.log(`\nDone. ${EMAIL} should have access after next app launch / RC refresh.`);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
