import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });

const CUTOFF = new Date("2026-08-27T22:00:00Z");
const CUTOFF_SEC = Math.floor(CUTOFF.getTime() / 1000);

(async () => {
  console.log(`\nSince ${CUTOFF.toISOString()} (inline flow deploy)\n`);

  // FunnelEvents: paywall views vs payment clicks vs SetupIntents since deploy
  const fe = await db.collection("FunnelEvents")
    .where("date", ">=", CUTOFF.toISOString().slice(0, 10))
    .select("step", "sessionId", "timestamp")
    .get();

  const paywallSessions = new Set<string>();
  const paymentSessions = new Set<string>();
  for (const doc of fe.docs) {
    const d = doc.data();
    const ts = d.timestamp as { toMillis?: () => number } | undefined;
    if (ts?.toMillis && ts.toMillis() < CUTOFF.getTime()) continue;
    const step = d.step as string;
    const sid = d.sessionId as string;
    if (step === "trialPaywall") paywallSessions.add(sid);
    if (step === "payment") paymentSessions.add(sid);
  }
  console.log(`trialPaywall views: ${paywallSessions.size} unique sessions`);
  console.log(`payment (Continue clicks): ${paymentSessions.size} unique sessions`);

  const sis = await stripe.setupIntents.list({ created: { gte: CUTOFF_SEC }, limit: 100 });
  const byStatus: Record<string, number> = {};
  for (const si of sis.data) byStatus[si.status] = (byStatus[si.status] ?? 0) + 1;
  console.log(`\nSetupIntents created: ${sis.data.length}`);
  for (const [s, n] of Object.entries(byStatus)) console.log(`  ${s}: ${n}`);

  console.log(`\n── Ratios ──`);
  const cvr = paywallSessions.size > 0 ? (paymentSessions.size / paywallSessions.size * 100).toFixed(1) : "n/a";
  console.log(`paywall → Continue click: ${cvr}%`);
  const siRate = paymentSessions.size > 0 ? (sis.data.length / paymentSessions.size * 100).toFixed(1) : "n/a";
  console.log(`Continue click → SetupIntent created: ${siRate}% (100% = every click created a SetupIntent)`);
})().catch(e => { console.error(e); process.exit(1); });
