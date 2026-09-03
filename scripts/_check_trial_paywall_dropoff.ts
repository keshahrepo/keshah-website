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

const CUTOFF = new Date("2026-08-26T20:15:00Z");
const CUTOFF_SEC = Math.floor(CUTOFF.getTime() / 1000);

async function main() {
  console.log(`\nSince ${CUTOFF.toISOString()} (ads launch)\n`);

  // 1. Full step-by-step FunnelEvents (unique sessionIds per step)
  const fe = await db
    .collection("FunnelEvents")
    .where("date", ">=", CUTOFF.toISOString().slice(0, 10))
    .select("step", "sessionId", "source", "timestamp")
    .get();

  const bySrc: Record<string, Record<string, Set<string>>> = {};
  for (const doc of fe.docs) {
    const data = doc.data();
    const ts = data.timestamp as { toMillis?: () => number } | undefined;
    if (ts?.toMillis && ts.toMillis() < CUTOFF.getTime()) continue;
    const src = (data.source as string) ?? "?";
    const step = (data.step as string) ?? "?";
    const sid = (data.sessionId as string) ?? "?";
    (bySrc[src] ??= {});
    (bySrc[src][step] ??= new Set()).add(sid);
  }

  // Print all steps in the order they appear so we see EVERY step, not
  // just the ones I already know about. Rank by count desc.
  for (const [src, stepMap] of Object.entries(bySrc).sort()) {
    console.log(`FunnelEvents · source="${src}":`);
    const stepCounts = Object.entries(stepMap).map(([s, set]) => ({
      step: s,
      count: set.size,
    }));
    stepCounts.sort((a, b) => b.count - a.count);
    for (const { step, count } of stepCounts) {
      console.log(`  ${step.padEnd(28)} ${count} unique sessions`);
    }
    console.log();
  }

  // 2. Stripe checkout sessions (any source) since cutoff
  const sessions = await stripe.checkout.sessions.list({
    created: { gte: CUTOFF_SEC },
    limit: 100,
  });
  console.log(`Stripe checkout sessions since cutoff: ${sessions.data.length}`);
  const byStatus: Record<string, number> = {};
  for (const s of sessions.data) {
    byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  }
  for (const [status, n] of Object.entries(byStatus)) {
    console.log(`  status=${status}: ${n}`);
  }

  // Print details of the 20 most-recent
  console.log("\nRecent sessions (last 20):");
  for (const s of sessions.data.slice(0, 20)) {
    const created = new Date(s.created * 1000).toISOString();
    const email = s.customer_details?.email ?? "-";
    const mode = s.mode;
    const url = s.url ? "has_url" : "no_url";
    console.log(
      `  ${s.id.slice(0, 20)}  ${created}  mode=${mode.padEnd(12)} status=${s.status.padEnd(10)} ${url}  email=${email}  sub=${s.subscription ?? "-"}`,
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
