// Restore najinthant@gmail.com to his pre-migration state:
//   - Grant lifetime RC promotional entitlements matching his original
//     $716 "KESHAH Experience - Full" purchase so mobile access unlocks
//   - Flip treatment_stage FREE_STOPPAGE → REGROWTH
//   - Stamp regrowth_switched_at_date=today (mobile computes regrowth_day
//     from this)
//   - regrowth_treatment_purchased=true, add "paidRegrowth" tag
//   - Preserve his aftercare_progress history untouched
//
// Usage:
//   set -a && source .env.local && set +a
//   CONFIRM=1 npx tsx scripts/_restore_najin.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const UID = "NtFTj5PCTGYUGLLx9xPMnEVXUMb2";
const EMAIL = "najinthant@gmail.com";

// Best-guess set. keshah_experience_full = flagship VIP (matches his
// $716 purchase). keshah_experience_v2 = modern flagship (may gate
// newer regrowth features). Grant both to be safe.
const ENTITLEMENTS_TO_GRANT = [
  "keshah_experience_full",
  "keshah_experience_v2",
  "keshah_aftercare_plan",
  "stoppage_treatment",
];

async function rcGrantLifetime(uid: string, entitlementId: string) {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}/entitlements/${encodeURIComponent(entitlementId)}/promotional`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RC_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ duration: "lifetime" }),
    },
  );
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

function todayDDMMYYYY(): string {
  const d = new Date();
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

async function main() {
  console.log(`\n=== Restore plan for ${EMAIL} (${UID}) ===\n`);

  const snap = await db.collection("Users").doc(UID).get();
  if (!snap.exists) throw new Error(`Users/${UID} not found`);
  const before = snap.data() ?? {};

  const dateString = todayDDMMYYYY();

  const patch: Record<string, unknown> = {
    treatment_stage: "REGROWTH",
    regrowth_switched_at_date: dateString,
    regrowth_treatment_purchased: true,
    regrowth_treatment_purchased_at: FieldValue.serverTimestamp(),
    pro: true,
    extra_user_tags: FieldValue.arrayUnion("paidRegrowth"),
    modified_at: FieldValue.serverTimestamp(),
  };

  console.log(`Firestore changes:`);
  for (const [k, v] of Object.entries(patch)) {
    const from = before[k];
    const toStr =
      v && typeof v === "object" && "_methodName" in v
        ? `(${(v as { _methodName: string })._methodName})`
        : JSON.stringify(v);
    console.log(`  ${k.padEnd(35)} ${JSON.stringify(from)} → ${toStr}`);
  }
  console.log(`\nRC entitlements to grant (lifetime promotional):`);
  for (const e of ENTITLEMENTS_TO_GRANT) console.log(`  - ${e}`);

  if (process.env.CONFIRM !== "1") {
    console.log(`\nRe-run with CONFIRM=1 to apply.`);
    return;
  }

  console.log(`\n=== EXECUTING ===`);

  // 1. Firestore
  await db.collection("Users").doc(UID).set(patch, { merge: true });
  console.log(`  ✓ Users/${UID} patched`);

  // 2. RC entitlements (grant each, log result)
  for (const e of ENTITLEMENTS_TO_GRANT) {
    const r = await rcGrantLifetime(UID, e);
    if (r.ok) {
      console.log(`  ✓ RC grant ${e}`);
    } else {
      console.log(`  ✗ RC grant ${e} → ${r.status} ${r.body.slice(0, 200)}`);
    }
  }

  console.log(`\nDone. Ask najin to force-close + reopen the app (or 'Restore Purchases').`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
