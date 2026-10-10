// Applies the refund / cancellation support policy to the LIVE prompts doc
// (support_config/active) without wiping the founder's other edits:
//   - canonical_answers: replaces the "=== BILLING: REFUNDS AND CANCELLATIONS ==="
//     block if present, otherwise appends it.
//   - category_rules: swaps the `- "account_change": ...` line for the new one
//     (regrowth kit refunds only) and replaces/appends the
//     "=== BILLING CATEGORY OVERRIDE ===" block.
//   - voice_rules: untouched.
// Bumps version by 1 only when something changed. Idempotent: a second run
// is a no-op.
//
// Run:   npx tsx scripts/support-billing-policy-migration.ts          (dry run, prints the diff summary)
//        npx tsx scripts/support-billing-policy-migration.ts --apply  (writes)
// Needs FIREBASE_SERVICE_ACCOUNT (base64) in the env, same as other scripts.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { applyBillingPolicy } from "../lib/support/billing-policy";
import { DEFAULT_CANONICAL_ANSWERS, DEFAULT_CATEGORY_RULES } from "../lib/support/prompts";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const apply = process.argv.includes("--apply");

async function main() {
  const ref = db.collection("support_config").doc("active");
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: "missing" as const };
    const d = snap.data() as Record<string, unknown>;
    const before = {
      canonicalAnswers: (d.canonical_answers as string) ?? DEFAULT_CANONICAL_ANSWERS,
      categoryRules: (d.category_rules as string) ?? DEFAULT_CATEGORY_RULES,
    };
    const next = applyBillingPolicy(before);
    const version = (d.version as number) ?? 1;
    if (!next.changed) return { status: "unchanged" as const, version };
    if (apply) {
      tx.update(ref, {
        canonical_answers: next.canonicalAnswers,
        category_rules: next.categoryRules,
        version: version + 1,
        updated_at: Timestamp.now(),
      });
    }
    return { status: apply ? ("applied" as const) : ("dry-run" as const), version, before, next };
  });

  if (result.status === "missing") {
    console.log("support_config/active doesn't exist yet. Nothing to do: the next draft seeds it from the updated defaults.");
    return;
  }
  if (result.status === "unchanged") {
    console.log(`Already up to date (version ${result.version}). No write.`);
    return;
  }
  console.log(`--- canonical_answers (after) ---\n${result.next.canonicalAnswers}\n`);
  console.log(`--- category_rules (after) ---\n${result.next.categoryRules}\n`);
  console.log(
    result.status === "applied"
      ? `Applied. version ${result.version} -> ${result.version + 1}.`
      : `Dry run. Would bump version ${result.version} -> ${result.version + 1}. Re-run with --apply to write.`,
  );
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
