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
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${RC_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
async function batch<T, R>(items: T[], fn: (x: T) => Promise<R>, c=30): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({length: c}, async () => {
    while (true) { const idx = i++; if (idx >= items.length) break; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

(async () => {
  const snap = await db.collection("Users").where("referral_source", "!=", null).get();
  const users = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Total users with referral_source set: ${users.length}`);

  // Breakdown by source
  const bySource: Record<string, { total: number; uids: string[] }> = {};
  for (const d of users) {
    const src = d.data().referral_source || "unknown";
    if (!bySource[src]) bySource[src] = { total: 0, uids: [] };
    bySource[src].total++;
    bySource[src].uids.push(d.id);
  }

  console.log(`\n=== Total users by source (answered the question) ===`);
  Object.entries(bySource).sort((a,b) => b[1].total - a[1].total).forEach(([src, d]) => {
    console.log(`  ${src.padEnd(28)}: ${d.total}`);
  });

  // For each source, query RC for payment status
  console.log(`\n=== Paid conversion by source (RC cross-reference) ===`);
  console.log(`Source                        Total  Paid  Trial Expired  Paid%`);
  console.log(`───────────────────────────────────────────────────────────────`);

  for (const src of Object.keys(bySource).sort((a,b) => bySource[b].total - bySource[a].total)) {
    const uids = bySource[src].uids;
    const results = await batch(uids, async (uid) => {
      const sub: any = await rc(uid);
      const subs = sub?.subscriber?.subscriptions || {};
      let category = "no_record";
      for (const [pid, s] of Object.entries<any>(subs)) {
        if (pid.startsWith("rc_promo")) continue;
        const expired = new Date(s.expires_date).getTime() < Date.now();
        if (expired) category = "expired";
        else if (s.period_type === "trial") category = "trial";
        else if (s.period_type === "normal" || s.period_type === "intro") { category = "paid"; break; }
      }
      // Also check Razorpay
      const doc = await db.collection("Users").doc(uid).get();
      const data = doc.data();
      if (data?.razorpay_subscription_id && category !== "paid") category = "paid";
      return category;
    }, 30);

    const counts: Record<string, number> = {};
    results.forEach(r => counts[r] = (counts[r] || 0) + 1);
    const paid = counts.paid || 0;
    const trial = counts.trial || 0;
    const expired = counts.expired || 0;
    const paidPct = Math.round((paid / uids.length) * 100);
    console.log(`${src.padEnd(28)}  ${String(uids.length).padStart(5)}  ${String(paid).padStart(4)}  ${String(trial).padStart(5)}  ${String(expired).padStart(6)}  ${String(paidPct+"%").padStart(5)}`);
  }

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
