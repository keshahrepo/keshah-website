import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

async function rc(uid: string) {
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, { headers: { Authorization: `Bearer ${RC_KEY}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
async function batch<T,R>(items: T[], fn: (x: T) => Promise<R>, c=40): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({length: c}, async () => {
    while (true) { const idx = i++; if (idx >= items.length) break; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

(async () => {
  // ALL users with start_date (no date filter)
  const snap = await db.collection("Users").where("start_date", "!=", null).get();
  const users = snap.docs.filter(d => !d.data().is_deleted).map(d => d.id);
  console.log(`All users with start_date (non-deleted): ${users.length}`);

  const results = await batch(users, async (uid) => {
    const sub: any = await rc(uid);
    const ent = sub?.subscriber?.entitlements?.stoppage_treatment;
    // "Has RC data with entitlement history" = has current or past entitlement
    const hasEver = !!ent || !!sub?.subscriber?.subscriptions;
    const subscriptions = sub?.subscriber?.subscriptions || {};
    // Count real paid subscriptions (exclude rc_promo_*)
    let everPaid = false;
    let currentlyPaid = false;
    for (const [pid, s] of Object.entries<any>(subscriptions)) {
      if (pid.startsWith("rc_promo")) continue;
      if (s.period_type === "normal" || s.period_type === "intro") {
        everPaid = true;
        if (!s.unsubscribe_detected_at || new Date(s.expires_date).getTime() > Date.now()) {
          currentlyPaid = true;
        }
      }
    }
    return { uid, hasEver, everPaid, currentlyPaid };
  }, 40);

  const everPaid = results.filter(r => r.everPaid).length;
  const currentlyPaid = results.filter(r => r.currentlyPaid).length;
  const hasRC = results.filter(r => r.hasEver).length;
  console.log(`\n=== Full cohort reconciliation ===`);
  console.log(`  With any RC record:            ${hasRC}`);
  console.log(`  Ever paid (normal or intro):   ${everPaid}  ← should match RC "total paying"`);
  console.log(`  Currently paid:                ${currentlyPaid}  ← MRR signal`);
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
