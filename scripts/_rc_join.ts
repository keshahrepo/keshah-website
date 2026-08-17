import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.REVENUECAT_SECRET_KEY!;

// Concurrent-ish RC fetch with a small concurrency cap so we don't blow
// past their rate limit (60 req/sec on production tier).
async function fetchRc(uid: string): Promise<{
  hasActive: boolean;
  inTrial: boolean;
  productIds: string[];
} | null> {
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${RC_KEY}` },
    });
    if (res.status === 404) return { hasActive: false, inTrial: false, productIds: [] };
    if (!res.ok) {
      console.error(`RC ${res.status} for ${uid}`);
      return null;
    }
    const body: any = await res.json();
    const subscriber = body.subscriber || {};
    const subs = subscriber.subscriptions || {};
    const ents = subscriber.entitlements || {};
    const now = Date.now();
    let hasActive = false;
    let inTrial = false;
    const productIds: string[] = [];
    for (const [pid, sub] of Object.entries<any>(subs)) {
      const expires = sub.expires_date ? Date.parse(sub.expires_date) : null;
      const isActive = !expires || expires > now;
      if (isActive) {
        productIds.push(pid);
        hasActive = true;
        if (sub.period_type === "trial") inTrial = true;
      }
    }
    return { hasActive, inTrial, productIds };
  } catch (e: any) {
    console.error(`RC err for ${uid}:`, e.message);
    return null;
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

(async () => {
  const days = parseInt(process.argv[2] || "14", 10);
  const cutoff = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
  console.log(`Loading Firestore signups in last ${days} days...`);
  const snap = await db.collection("Users").where("created_at", ">=", cutoff).get();
  console.log(`  ${snap.size} signups\n`);

  const users = snap.docs.map((d) => {
    const u: any = d.data();
    return {
      uid: d.id,
      source: (u.referral_source as string | undefined) ?? "(unset)",
      gender: (u.selected_gender as string | undefined) ?? "(unset)",
    };
  });

  console.log(`Querying RC for ${users.length} subscribers (concurrency 8)...`);
  let done = 0;
  const t0 = Date.now();
  const results = await runWithConcurrency(users, 8, async (u) => {
    const rc = await fetchRc(u.uid);
    done++;
    if (done % 500 === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`  ${done}/${users.length} (${elapsed}s elapsed)`);
    }
    return { ...u, rc };
  });
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);

  type Row = { signups: number; active: number; trial: number; paid: number; f: number; m: number; activeF: number; activeM: number };
  const bySource: Record<string, Row> = {};
  for (const r of results) {
    const s = r.source;
    if (!bySource[s]) bySource[s] = { signups: 0, active: 0, trial: 0, paid: 0, f: 0, m: 0, activeF: 0, activeM: 0 };
    bySource[s].signups++;
    if (r.gender === "female") bySource[s].f++;
    else if (r.gender === "male") bySource[s].m++;
    if (r.rc?.hasActive) {
      bySource[s].active++;
      if (r.rc.inTrial) bySource[s].trial++;
      else bySource[s].paid++;
      if (r.gender === "female") bySource[s].activeF++;
      else if (r.gender === "male") bySource[s].activeM++;
    }
  }

  const sorted = Object.entries(bySource).sort((a, b) => b[1].signups - a[1].signups);
  console.log(`Source                       | Signups | Active | Trial | Paid | Conv  | Paid F | Paid M`);
  console.log(`-----------------------------|---------|--------|-------|------|-------|--------|-------`);
  let totalSignups = 0, totalActive = 0, totalPaid = 0;
  for (const [src, r] of sorted) {
    totalSignups += r.signups;
    totalActive += r.active;
    totalPaid += r.paid;
    const conv = r.signups > 0 ? `${(r.paid / r.signups * 100).toFixed(1)}%` : "—";
    console.log(
      `${src.padEnd(28)} | ${String(r.signups).padStart(7)} | ${String(r.active).padStart(6)} | ${String(r.trial).padStart(5)} | ${String(r.paid).padStart(4)} | ${conv.padStart(5)} | ${String(r.activeF).padStart(6)} | ${String(r.activeM).padStart(5)}`,
    );
  }
  console.log(`-----------------------------|---------|--------|-------|------|-------|--------|-------`);
  console.log(
    `${"TOTAL".padEnd(28)} | ${String(totalSignups).padStart(7)} | ${String(totalActive).padStart(6)} |       | ${String(totalPaid).padStart(4)} | ${(totalPaid / totalSignups * 100).toFixed(1).padStart(4)}% |        |`,
  );
  process.exit(0);
})().catch((e: any) => { console.error(e); process.exit(1); });
