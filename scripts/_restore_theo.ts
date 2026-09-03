// Restore theodubreuil@hotmail.fr — grant RC entitlements only.
// His Firestore Users doc is already correct (REGROWTH stage, day 212,
// regrowth_treatment_purchased=true, open_account=true). What broke:
// RC has zero entitlements. Mobile app is presumably gating regrowth
// content on RC even though open_account should bypass — grant lifetime
// promotional entitlements to unblock him.
//
// He paid $729 to Stripe on 2026-01-14 for the regrowth kit — one-time,
// not a subscription, so RC never had anything to track.
//
// Usage:
//   set -a && source .env.local && set +a
//   CONFIRM=1 npx tsx scripts/_restore_theo.ts

const RC_KEY = process.env.RC_API_SECRET_KEY!;

const UID = "kKxhxVcgME188I1PVLtK";
const EMAIL = "theodubreuil@hotmail.fr";

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
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function main() {
  console.log(`\n=== Restore plan for ${EMAIL} (${UID}) ===\n`);
  console.log(`Firestore: no changes (already correct — REGROWTH stage, day 212)`);
  console.log(`RC entitlements to grant (lifetime promotional):`);
  for (const e of ENTITLEMENTS_TO_GRANT) console.log(`  - ${e}`);

  if (process.env.CONFIRM !== "1") {
    console.log(`\nRe-run with CONFIRM=1 to apply.`);
    return;
  }

  console.log(`\n=== EXECUTING ===`);
  for (const e of ENTITLEMENTS_TO_GRANT) {
    const r = await rcGrantLifetime(UID, e);
    if (r.ok) console.log(`  ✓ RC grant ${e}`);
    else console.log(`  ✗ RC grant ${e} → ${r.status} ${r.body.slice(0, 200)}`);
  }
  console.log(`\nDone. Ask theo to force-close + reopen the app.`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
