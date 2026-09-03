// Check Stripe checkout activity since ads launched at 4:15pm EDT today.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const CUTOFF = new Date("2026-08-26T20:15:00Z"); // 4:15pm EDT
const CUTOFF_SEC = Math.floor(CUTOFF.getTime() / 1000);

async function main() {
  console.log(`\nSince ${CUTOFF.toISOString()} (4:15pm EDT):\n`);

  // Stripe: list checkout sessions created after cutoff
  const sessions = await stripe.checkout.sessions.list({
    created: { gte: CUTOFF_SEC },
    limit: 100,
  });
  console.log(`Stripe checkout sessions: ${sessions.data.length}`);
  for (const s of sessions.data) {
    const email = s.customer_details?.email ?? "(no email)";
    const created = new Date(s.created * 1000).toISOString();
    console.log(
      `  ${s.id}  status=${s.status.padEnd(10)} ${created}  ${email}  sub=${s.subscription ?? "-"}`,
    );
  }

  // PaidWebSessions written since cutoff (webhook only fires after
  // subscription.created)
  console.log(`\nPaidWebSessions since cutoff:`);
  const pws = await db
    .collection("PaidWebSessions")
    .where("created_at", ">=", CUTOFF)
    .get();
  console.log(`  ${pws.size} docs`);
  pws.forEach((d) => {
    const data = d.data();
    console.log(
      `  ${d.id}  email=${data.email ?? "-"}  sub=${data.subscription_id}  claimed_by=${data.claimed_by_uid ?? "-"}`,
    );
  });

  // FunnelEvents by step count since cutoff — for the higher-funnel steps
  // that indicate someone got close to checkout
  console.log(`\nFunnelEvents by step (sessions post-cutoff):`);
  const fe = await db
    .collection("FunnelEvents")
    .where("date", ">=", CUTOFF.toISOString().slice(0, 10))
    .select("step", "sessionId", "source", "timestamp")
    .get();
  const bySrc: Record<string, Record<string, Set<string>>> = {};
  for (const doc of fe.docs) {
    const data = doc.data();
    const src = (data.source as string) ?? "?";
    const step = (data.step as string) ?? "?";
    const sid = (data.sessionId as string) ?? "?";
    const ts = data.timestamp as { toMillis?: () => number } | undefined;
    if (ts?.toMillis && ts.toMillis() < CUTOFF.getTime()) continue;
    (bySrc[src] ??= {});
    (bySrc[src][step] ??= new Set()).add(sid);
  }
  const KEY_STEPS = ["landingHook", "founderStory", "pinchTest", "resultScreenshots", "qualification", "trialPaywall", "payment"];
  for (const [src, stepMap] of Object.entries(bySrc).sort()) {
    console.log(`  source="${src}":`);
    for (const step of KEY_STEPS) {
      const count = stepMap[step]?.size ?? 0;
      if (count) console.log(`    ${step.padEnd(20)} ${count} unique sessions`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
