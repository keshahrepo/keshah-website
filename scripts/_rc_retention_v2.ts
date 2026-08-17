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
  } catch { return null; }
}

async function batch<T, R>(items: T[], fn: (x: T) => Promise<R>, concurrency = 30): Promise<R[]> {
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
  const snap = await db.collection("Users").where("created_at", ">=", LAUNCH).get();
  const users = snap.docs.filter(d => !d.data().is_deleted && !!d.data().start_date).map(d => ({ uid: d.id, data: d.data() }));
  console.log(`Non-deleted users with start_date: ${users.length}`);

  const results = await batch(users, async (u) => {
    const sub: any = await rcSubscriber(u.uid);
    const ent = sub?.subscriber?.entitlements?.stoppage_treatment;
    const now = Date.now();
    if (!ent) return { uid: u.uid, category: "no_entitlement", ageDays: u.data.created_at ? Math.floor((now - u.data.created_at.toDate().getTime())/86400000) : 0 };
    const expires = ent?.expires_date ? new Date(ent.expires_date).getTime() : null;
    const stillActive = expires ? expires > now : false;
    if (!stillActive) return { uid: u.uid, category: "expired", ageDays: u.data.created_at ? Math.floor((now - u.data.created_at.toDate().getTime())/86400000) : 0 };
    
    const productId = ent.product_identifier;
    if (productId?.includes("rc_promo")) return { uid: u.uid, category: "web_promo_grant", ageDays: u.data.created_at ? Math.floor((now - u.data.created_at.toDate().getTime())/86400000) : 0 };
    
    // Authoritative period check
    const subscription = sub.subscriber?.subscriptions?.[productId];
    const periodType = subscription?.period_type; // "normal" | "trial" | "intro"
    
    let category: string;
    if (periodType === "trial") category = "active_trial";
    else if (periodType === "intro") category = "active_intro";
    else category = "active_paid";
    
    return { uid: u.uid, category, productId, ageDays: u.data.created_at ? Math.floor((now - u.data.created_at.toDate().getTime())/86400000) : 0 };
  }, 30);

  const counts: Record<string, number> = {};
  for (const r of results) counts[r.category] = (counts[r.category] || 0) + 1;
  console.log(`\n=== Accurate classification ===`);
  Object.entries(counts).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k.padEnd(22)}: ${v}`));

  console.log(`\n=== Day 30 engagement by segment ===`);
  for (const seg of ["active_paid", "active_trial", "active_intro", "expired", "no_entitlement", "web_promo_grant"]) {
    const segUsers = results.filter(r => r.category === seg && r.ageDays >= 30);
    if (segUsers.length === 0) continue;
    let completed = 0;
    for (const r of segUsers) {
      const userDoc = users.find(u => u.uid === r.uid);
      const progress = userDoc?.data.progress as Record<string, unknown[]> | undefined;
      if (progress?.day30 && Array.isArray(progress.day30) && progress.day30.length > 0) completed++;
    }
    const pct = Math.round((completed/segUsers.length)*100);
    console.log(`  ${seg.padEnd(22)}: ${pct}%  (${completed}/${segUsers.length} eligible)`);
  }

  // Day curve for active_paid only
  console.log(`\n=== Active paid retention curve ===`);
  const paidUsers = results.filter(r => r.category === "active_paid");
  for (const day of [1, 2, 3, 7, 15, 30, 45, 60]) {
    const eligible = paidUsers.filter(r => r.ageDays >= day);
    if (eligible.length === 0) continue;
    let done = 0;
    for (const r of eligible) {
      const userDoc = users.find(u => u.uid === r.uid);
      const progress = userDoc?.data.progress as Record<string, unknown[]> | undefined;
      if (progress?.[`day${day}`] && Array.isArray(progress[`day${day}`]) && progress[`day${day}`].length > 0) done++;
    }
    console.log(`  Day ${day.toString().padStart(2)}: ${Math.round((done/eligible.length)*100).toString().padStart(2)}%  (${done}/${eligible.length})`);
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
