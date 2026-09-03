// Backfill install_source on recent users straight from RevenueCat's
// Appstack attribution — bypasses the /api/rc/backfill-attribution
// endpoint (which needs CRON_SECRET) by hitting RC + Firestore directly.
//
// Same derivation as the production endpoint: mediaSource ∈ known ad
// networks → "paid", else "organic".
//
// Usage:
//   npx tsx scripts/_backfill_install_source_now.ts [--days 3] [--refresh] [--apply]

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const APPLY = process.argv.includes("--apply");
const REFRESH = process.argv.includes("--refresh");
const daysIdx = process.argv.indexOf("--days");
const DAYS = daysIdx >= 0 ? Math.max(1, parseInt(process.argv[daysIdx + 1] ?? "3", 10)) : 3;
const CONCURRENCY = 6;

const RC_SECRET = process.env.RC_API_SECRET_KEY;
if (!RC_SECRET) {
  console.error("RC_API_SECRET_KEY missing"); process.exit(1);
}

const PAID_NETWORKS = new Set([
  "facebook", "meta", "meta_ads", "instagram",
  "google", "googleads", "google_ads", "adwords", "google_adwords_int", "ua_int",
  "tiktok", "tiktok_ads", "tiktokforbusiness_int",
  "snapchat", "reddit", "twitter", "x",
  "applesearchads", "apple_search_ads", "apple_ads",
  "youtube",
]);

function derive(mediaSource: string | null): "paid" | "organic" {
  if (!mediaSource) return "organic";
  const ms = mediaSource.toLowerCase().trim();
  for (const n of PAID_NETWORKS) if (ms === n || ms.startsWith(n + "_") || ms.includes(n)) return "paid";
  return "organic";
}

interface RcSubscriberAttr { value?: string }
interface RcResp { subscriber?: { subscriber_attributes?: Record<string, RcSubscriberAttr> } }

async function fetchMediaSource(uid: string): Promise<{ mediaSource: string | null; missing: boolean }> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${RC_SECRET}` },
  });
  if (res.status === 404) return { mediaSource: null, missing: true };
  if (!res.ok) throw new Error(`RC ${res.status}`);
  const body = (await res.json()) as RcResp;
  const attrs = body.subscriber?.subscriber_attributes ?? {};
  const v = attrs["$mediaSource"]?.value;
  return { mediaSource: typeof v === "string" && v.length ? v : null, missing: false };
}

(async () => {
  const since = Timestamp.fromMillis(Date.now() - DAYS * 86_400_000);
  const snap = await db.collection("Users").where("created_at", ">=", since).get();

  const jobs: string[] = [];
  let skipDeleted = 0, skipLabelled = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.is_deleted) { skipDeleted++; continue; }
    if (!REFRESH && typeof d.install_source === "string" && d.install_source.length > 0) {
      skipLabelled++; continue;
    }
    jobs.push(doc.id);
  }

  console.log(`Scanned ${snap.size} users from last ${DAYS}d`);
  console.log(`  eligible: ${jobs.length}  skipped(deleted): ${skipDeleted}  skipped(already labelled): ${skipLabelled}`);
  if (!APPLY) {
    console.log("(dry — add --apply to write)");
    process.exit(0);
  }

  let ok = 0, notFoundInRc = 0, err = 0;
  const byInstall: Record<string, number> = {};

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const slice = jobs.slice(i, i + CONCURRENCY);
    await Promise.all(slice.map(async (uid) => {
      try {
        const { mediaSource, missing } = await fetchMediaSource(uid);
        if (missing) { notFoundInRc++; return; }
        const install_source = derive(mediaSource);
        await db.collection("Users").doc(uid).set({
          install_source,
          attribution_media_source: mediaSource,
        }, { merge: true });
        ok++;
        byInstall[install_source] = (byInstall[install_source] ?? 0) + 1;
      } catch (e) {
        err++;
        console.error(`  ! ${uid}: ${e instanceof Error ? e.message : e}`);
      }
    }));
    process.stdout.write(`  ${Math.min(i + CONCURRENCY, jobs.length)}/${jobs.length}\r`);
  }

  console.log("\n");
  console.log(`ok=${ok}  not_in_rc=${notFoundInRc}  errors=${err}`);
  console.log(`by install_source: ${JSON.stringify(byInstall)}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
