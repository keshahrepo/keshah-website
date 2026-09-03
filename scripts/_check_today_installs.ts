import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
// "Today" = past 24h
const CUTOFF = new Date(Date.now() - 24 * 3600 * 1000);
(async () => {
  console.log(`\nUsers created since ${CUTOFF.toISOString()} (past 24h)\n`);
  const snap = await db.collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(CUTOFF))
    .get();
  console.log(`Total new Users docs: ${snap.size}\n`);
  const byType: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const trials: string[] = [];
  const paid: string[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const type = (d.user_type as string) ?? "?";
    byType[type] = (byType[type] ?? 0) + 1;
    const prov = (d.providerId as string) ?? "?";
    byProvider[prov] = (byProvider[prov] ?? 0) + 1;
    const src = (d.signup_source as string) ?? "?";
    bySource[src] = (bySource[src] ?? 0) + 1;
    if (d.started_trial || d.trial_started_at) {
      trials.push(`${d.email ?? "?"}  provider=${prov}  source=${src}`);
    }
    if (d.pro === true || d.subscription_active_at) {
      paid.push(`${d.email ?? "?"}  provider=${prov}`);
    }
  }
  console.log(`By user_type:`, byType);
  console.log(`By providerId:`, byProvider);
  console.log(`By signup_source:`, bySource);
  console.log(`\nTrial starters (${trials.length}):`);
  trials.forEach(t => console.log(`  ${t}`));
  console.log(`\nPaid (${paid.length}):`);
  paid.forEach(p => console.log(`  ${p}`));
})().catch(e => { console.error(e); process.exit(1); });
