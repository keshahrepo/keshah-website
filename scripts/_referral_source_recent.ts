// One-off: count referral_source answers from users created after a
// given timestamp (ISO date or Unix). Use this to see the post-update
// answer distribution.
//
// Usage:
//   npx tsx scripts/_referral_source_recent.ts <sinceISO>
//   e.g. npx tsx scripts/_referral_source_recent.ts 2026-05-05T00:00:00Z

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const sinceIso = (process.argv[2] ?? "").trim();
  if (!sinceIso) {
    console.error("Usage: _referral_source_recent.ts <sinceISO>");
    console.error("  e.g. 2026-05-05T00:00:00Z");
    process.exit(1);
  }
  const sinceDate = new Date(sinceIso);
  if (isNaN(sinceDate.getTime())) {
    console.error(`Invalid date: ${sinceIso}`);
    process.exit(1);
  }
  const sinceTs = Timestamp.fromDate(sinceDate);

  console.log(`Looking for users with referral_source set, created_at >= ${sinceDate.toISOString()}...\n`);

  // Two-step filter — Firestore can only do one inequality, so we filter
  // by created_at then check referral_source in-memory.
  const snap = await db.collection("Users")
    .where("created_at", ">=", sinceTs)
    .get();

  const docs = snap.docs.filter(d => {
    const x = d.data();
    return !x.is_deleted && x.referral_source;
  });

  console.log(`Total NEW users since ${sinceDate.toISOString()} who answered: ${docs.length}`);
  console.log(`(Of ${snap.size} total new users in window — ${snap.size - docs.length} either skipped the question or were filtered as deleted)\n`);

  const bySource: Record<string, number> = {};
  for (const d of docs) {
    const src = d.data().referral_source as string;
    bySource[src] = (bySource[src] || 0) + 1;
  }

  console.log(`=== Referral source breakdown ===`);
  Object.entries(bySource).sort((a,b) => b[1] - a[1]).forEach(([src, n]) => {
    const pct = Math.round((n / docs.length) * 100);
    console.log(`  ${src.padEnd(28)}: ${String(n).padStart(5)}  (${pct}%)`);
  });

  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
