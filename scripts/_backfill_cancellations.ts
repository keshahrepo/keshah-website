// Backfill subscription_status:"cancelled" + subscription_cancelled_at
// from RC's REST API for every trial-starter in the +162 cohort.
//
// Motivation: the RC webhook was 401'ing from setup through 2026-08-20
// ~14:25 UTC because the Authorization header value in Vercel drifted
// from the RC dashboard value. Every CANCELLATION event in that window
// was rejected. RC does not re-fire past its retry window, but the
// current cancelled/active state is still queryable per-user via
//   GET /v1/subscribers/{app_user_id}
//
// For each trial-starter, we pull their subscriber record, check whether
// any of their subscription objects has an unset_at (RC's field name for
// "user cancelled") and mirror that into Firestore.
//
// Idempotent: only writes if Firestore doesn't already have
// subscription_status set (leaves fresh webhook writes alone).

import { getFirebaseAdmin } from "../lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const RELEASE_CUTOFF = new Date("2026-08-18T00:00:00Z");
const RC_KEY = process.env.RC_API_SECRET_KEY;
const DRY_RUN = process.argv.includes("--apply") ? false : true;

interface RcSubscriberResp {
  subscriber?: {
    subscriptions?: Record<string, {
      expires_date?: string | null;
      unsubscribe_detected_at?: string | null;
      auto_resume_date?: string | null;
      period_type?: string;
      store?: string;
      product_identifier?: string;
    }>;
  };
}

async function main() {
  if (!RC_KEY) { console.error("RC_API_SECRET_KEY not set"); process.exit(1); }

  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(RELEASE_CUTOFF))
    .select("started_trial", "subscription_status", "email")
    .get();

  const trialUids: string[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (/^test\d+@test\.com$/i.test(d.email ?? "")) continue;
    if (!d.started_trial) continue;
    if (d.subscription_status) continue;  // already has state — skip (leave webhook writes alone)
    trialUids.push(doc.id);
  }

  console.log(`Trial starters to check: ${trialUids.length} (${DRY_RUN ? "DRY RUN" : "APPLYING"})`);

  let cancelled = 0;
  let active = 0;
  let unknown = 0;
  let apiErrors = 0;
  const writes: Array<{ uid: string; cancelledAt: string; productId: string }> = [];

  for (let i = 0; i < trialUids.length; i++) {
    const uid = trialUids[i];
    try {
      const resp = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
        { headers: { Authorization: `Bearer ${RC_KEY}` } }
      );
      if (!resp.ok) { apiErrors++; continue; }
      const body = (await resp.json()) as RcSubscriberResp;
      const subs = body.subscriber?.subscriptions ?? {};
      const entries = Object.entries(subs);
      if (entries.length === 0) { unknown++; continue; }

      // RC marks "user cancelled but still has entitlement until expiry" via
      // unsubscribe_detected_at. If that field is set on ANY subscription
      // and auto_resume_date is null, they've cancelled.
      const cancelledSub = entries.find(([, s]) =>
        !!s.unsubscribe_detected_at && !s.auto_resume_date
      );
      if (cancelledSub) {
        cancelled++;
        writes.push({
          uid,
          cancelledAt: cancelledSub[1].unsubscribe_detected_at!,
          productId: cancelledSub[1].product_identifier ?? cancelledSub[0],
        });
      } else {
        active++;
      }
    } catch (err) {
      apiErrors++;
    }
    if ((i + 1) % 20 === 0) console.log(`  scanned ${i + 1}/${trialUids.length}…`);
  }

  console.log(`\n=== Scan complete ===`);
  console.log(`Cancelled: ${cancelled}`);
  console.log(`Active:    ${active}`);
  console.log(`Unknown:   ${unknown} (no subscriptions in RC — probably anonymous or mid-alias)`);
  console.log(`API errs:  ${apiErrors}`);

  if (cancelled > 0) {
    console.log(`\nCancels to backfill:`);
    for (const w of writes) {
      console.log(`  ${w.uid}  ${w.cancelledAt}  ${w.productId}`);
    }
  }

  if (DRY_RUN) {
    console.log(`\nDRY RUN — re-run with --apply to write.`);
    return;
  }

  console.log(`\nApplying ${writes.length} writes…`);
  for (const w of writes) {
    await db.collection("Users").doc(w.uid).set({
      subscription_status: "cancelled",
      subscription_cancelled_at: Timestamp.fromDate(new Date(w.cancelledAt)),
      subscription_cancelled_product_id: w.productId,
      subscription_cancelled_source: "backfill_2026-08-20",
      modified_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  console.log(`Done.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
