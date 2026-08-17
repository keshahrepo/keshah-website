import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
const LAUNCH = new Date("2026-02-23T00:00:00Z");

async function rcSubscriber(uid: string) {
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${RC_KEY}` } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function batch<T, R>(items: T[], fn: (x: T) => Promise<R>, concurrency = 25): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

(async () => {
  // Sample the 2128 cohort (post-Feb 23) — match dashboard exactly
  const snap = await db.collection("Users")
    .where("created_at", ">=", LAUNCH)
    
    .get();
  console.log(`Dashboard cohort: ${snap.size} users`);

  const users = snap.docs.map(d => ({
    uid: d.id,
    data: d.data(),
  })).filter(u => !u.data.is_deleted && !!u.data.start_date);

  console.log(`Non-deleted: ${users.length}`);
  console.log(`Querying RevenueCat for each...`);

  const startedAt = Date.now();
  const results = await batch(users, async (u) => {
    const sub = await rcSubscriber(u.uid);
    const ent = sub?.subscriber?.entitlements?.stoppage_treatment;
    const expires = ent?.expires_date ? new Date(ent.expires_date).getTime() : null;
    const now = Date.now();
    const stillActive = expires ? expires > now : false;
    const productId = ent?.product_identifier || null;
    
    // Classify
    let category: string;
    if (!ent) category = "no_entitlement";
    else if (productId?.includes("rc_promo")) category = "web_promo_grant";  // our /tryfree + /startindiafree grants
    else if (!stillActive) category = "expired";
    else if (productId?.includes("trial")) category = "active_app_trial";
    else category = "active_paid";

    return { uid: u.uid, category, productId, stillActive, ageDays: u.data.created_at ? Math.floor((now - u.data.created_at.toDate().getTime()) / 86400000) : 0 };
  }, 30);
  console.log(`Done in ${Math.round((Date.now() - startedAt)/1000)}s`);

  const counts: Record<string, number> = {};
  for (const r of results) counts[r.category] = (counts[r.category] || 0) + 1;

  console.log(`\n=== RC classification ===`);
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k.padEnd(22)}: ${v}`);
  });

  // Look at a few product_identifiers
  const uniqueProducts = Array.from(new Set(results.map(r => r.productId).filter(Boolean))).slice(0, 20);
  console.log(`\n=== Sample product IDs ===`);
  uniqueProducts.forEach(p => console.log(`  ${p}`));

  // Day 30 retention by segment
  console.log(`\n=== Day 30 engagement by segment ===`);
  for (const segment of ["active_paid", "active_app_trial", "expired", "no_entitlement"]) {
    const segUsers = results.filter(r => r.category === segment && r.ageDays >= 30);
    if (segUsers.length === 0) continue;
    let completed30 = 0;
    for (const r of segUsers) {
      const userDoc = users.find(u => u.uid === r.uid);
      const progress = userDoc?.data.progress as Record<string, unknown[]> | undefined;
      if (progress?.day30 && Array.isArray(progress.day30) && progress.day30.length > 0) completed30++;
    }
    const pct = Math.round((completed30 / segUsers.length) * 100);
    console.log(`  ${segment.padEnd(22)}: ${pct}%  (${completed30}/${segUsers.length} at 30+ days old)`);
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
