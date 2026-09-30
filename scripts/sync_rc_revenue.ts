// Sync lifetime revenue from RevenueCat into Firestore.
//
// WHY THIS EXISTS: the RevenueCat webhook records revenue from today
// forward, but every conversion before 2026-09-30 predates that capture, so
// the dashboards read $0 for historical cohorts. This fills them in, and can
// be re-run any time to correct drift.
//
// RevenueCat is the source of truth. Each subscription carries
// total_revenue_in_usd with gross / commission / tax / proceeds already
// computed by them, so we don't have to guess a commission tier or track
// which region charges what tax. Values are SET, not incremented — re-running
// converges rather than accumulating.
//
// Requires a v2 API key. The legacy RC_API_SECRET_KEY is rejected by v2
// ("You're trying to use a legacy API key to access API v2").
//
// Usage:
//   npx tsx --env-file=.env.local scripts/sync_rc_revenue.ts            # dry run
//   APPLY=1 npx tsx --env-file=.env.local scripts/sync_rc_revenue.ts    # write
//   LIMIT=50 ...                                                       # sample

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PROJECT_ID = "proj4777c533";
const KEY = process.env.RC_API_V2_KEY;
const APPLY = process.env.APPLY === "1";
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0;

// RevenueCat's documented v2 limit is 10 req/s per project. Stay under it —
// a 429 mid-run would leave the sync half-applied.
const CONCURRENCY = 5;
const PAUSE_MS = 120;

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

type Money = {
  gross?: number;
  proceeds?: number;
  commission?: number;
  tax?: number;
  currency?: string;
};
type Sub = {
  total_revenue_in_usd?: Money;
  product_id?: string;
  status?: string;
  store?: string;
};

type RevenueRollup = {
  gross: number;
  proceeds: number;
  commission: number;
  tax: number;
  subs: number;
  byStore: Record<string, { gross: number; commission: number }>;
};

async function fetchRevenue(uid: string): Promise<RevenueRollup | null> {
  const url = `https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(
    uid
  )}/subscriptions`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });

  // 404 = RevenueCat has never seen this customer id. Common for users who
  // paid through Razorpay or were created before RC aliasing. Not an error.
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${uid}: ${(await res.text()).slice(0, 160)}`);
  }

  const json = (await res.json()) as { items?: Sub[] };
  const items = json.items ?? [];
  let gross = 0;
  let proceeds = 0;
  let commission = 0;
  let tax = 0;
  const byStore: Record<string, { gross: number; commission: number }> = {};

  // A customer can hold several subscriptions (renewals across products,
  // regrowth alongside stoppage). Lifetime value is the sum.
  for (const it of items) {
    const m = it.total_revenue_in_usd;
    if (!m) continue;
    if (typeof m.gross === "number") gross += m.gross;
    if (typeof m.proceeds === "number") proceeds += m.proceeds;
    if (typeof m.commission === "number") commission += m.commission;
    if (typeof m.tax === "number") tax += m.tax;

    // Kept per store because Apple and Google charge differently and the
    // blend is meaningless on its own — the first pass stored only gross
    // and proceeds, which made "is the Small Business Program applied?"
    // unanswerable without re-querying the API.
    const k = it.store ?? "unknown";
    byStore[k] ??= { gross: 0, commission: 0 };
    byStore[k].gross += m.gross ?? 0;
    byStore[k].commission += m.commission ?? 0;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  for (const k of Object.keys(byStore)) {
    byStore[k] = { gross: r2(byStore[k].gross), commission: r2(byStore[k].commission) };
  }
  return {
    gross: r2(gross),
    proceeds: r2(proceeds),
    commission: r2(commission),
    tax: r2(tax),
    subs: items.length,
    byStore,
  };
}

async function main() {
  if (!KEY) throw new Error("RC_API_V2_KEY missing — add it to .env.local");

  // ONLY_EXISTING re-syncs just the users a previous run found revenue for.
  // Use it after fixing a commission setting in RevenueCat: the population
  // that has revenue doesn't change, only the figures do, so scanning every
  // paid-ish user again is wasted API calls. Roughly 1,700 vs 6,000.
  const seen = new Set<string>();
  if (process.env.ONLY_EXISTING === "1") {
    const snap = await db
      .collection("Users")
      .where("revenue_source", "==", "rc_v2_sync")
      .get();
    snap.forEach((d) => seen.add(d.id));
    console.log(`  ONLY_EXISTING    ${snap.size} previously-synced users`);
  } else {
    // Anyone who ever paid. converted_trial is the post-trial billing
    // signal; first_paid_at and converted_at catch direct purchases and
    // older writes.
    for (const field of ["converted_trial", "first_paid_at", "converted_at"]) {
      const snap = await db.collection("Users").where(field, "!=", null).get();
      snap.forEach((d) => seen.add(d.id));
      console.log(`  ${field.padEnd(16)} ${snap.size} users`);
    }
  }
  let uids = [...seen];
  if (LIMIT > 0) uids = uids.slice(0, LIMIT);

  console.log(`\n${uids.length} distinct paid users. APPLY=${APPLY ? "yes" : "NO (dry run)"}\n`);

  let withRevenue = 0;
  let notInRc = 0;
  let failed = 0;
  let totalGross = 0;
  let totalProceeds = 0;
  let totalCommission = 0;
  let totalTax = 0;
  const storeTotals: Record<string, { gross: number; commission: number }> = {};

  for (let i = 0; i < uids.length; i += CONCURRENCY) {
    const batch = uids.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (uid) => {
        try {
          const rev = await fetchRevenue(uid);
          if (rev === null) {
            notInRc++;
            return;
          }
          if (rev.gross <= 0) return;

          withRevenue++;
          totalGross += rev.gross;
          totalProceeds += rev.proceeds;

          for (const [k, v] of Object.entries(rev.byStore)) {
            storeTotals[k] ??= { gross: 0, commission: 0 };
            storeTotals[k].gross += v.gross;
            storeTotals[k].commission += v.commission;
          }
          totalCommission += rev.commission;
          totalTax += rev.tax;

          if (APPLY) {
            await db.collection("Users").doc(uid).set(
              {
                revenue_usd_total: rev.gross,
                proceeds_usd_total: rev.proceeds,
                commission_usd_total: rev.commission,
                tax_usd_total: rev.tax,
                revenue_by_store: rev.byStore,
                revenue_synced_at: FieldValue.serverTimestamp(),
                revenue_source: "rc_v2_sync",
              },
              { merge: true }
            );
          }
        } catch (e) {
          failed++;
          console.error(`  ! ${uid}: ${e instanceof Error ? e.message : e}`);
        }
      })
    );
    await new Promise((r) => setTimeout(r, PAUSE_MS));
    if ((i / CONCURRENCY) % 20 === 0) {
      process.stdout.write(`  ...${Math.min(i + CONCURRENCY, uids.length)}/${uids.length}\n`);
    }
  }

  console.log(`\n${"=".repeat(52)}`);
  console.log(`  users with revenue   ${withRevenue}`);
  console.log(`  unknown to RC (404)  ${notInRc}`);
  console.log(`  failed               ${failed}`);
  console.log(`  gross                $${totalGross.toFixed(2)}`);
  console.log(`  proceeds             $${totalProceeds.toFixed(2)}`);
  console.log(
    `  commission           $${totalCommission.toFixed(2)} (${
      totalGross > 0 ? ((totalCommission / totalGross) * 100).toFixed(1) : "0"
    }%)`
  );
  console.log(
    `  tax                  $${totalTax.toFixed(2)} (${
      totalGross > 0 ? ((totalTax / totalGross) * 100).toFixed(1) : "0"
    }%)`
  );
  console.log(`\n  commission by store:`);
  for (const [k, v] of Object.entries(storeTotals)) {
    const rate = v.gross > 0 ? ((v.commission / v.gross) * 100).toFixed(1) : "—";
    console.log(`    ${k.padEnd(12)} gross $${v.gross.toFixed(0).padStart(8)}   commission ${rate}%`);
  }
  console.log(APPLY ? "  WRITTEN" : "  dry run — nothing written; re-run with APPLY=1");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
