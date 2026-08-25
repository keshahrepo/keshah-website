// Check whether any RC subscribers have Appstack attribution attributes set.
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_check_appstack_installs.ts [days]
//
// [days] defaults to 30 — scans Users created in the last N days.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
if (!RC_KEY) {
  console.error("Missing RC_API_SECRET_KEY in env");
  process.exit(1);
}

const DAYS = Number(process.argv[2] || 30);
const CONCURRENCY = 10;

async function getSubscriber(uid: string): Promise<any | null> {
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${RC_KEY}` } },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// RC stores Appstack-forwarded attribution as its standard attribution
// reserved attributes: $mediaSource, $campaign, $adGroup, $ad, $keyword,
// $creative. Also grab $appstackId + any raw appstack_* keys.
const ATTRIBUTION_KEYS = new Set([
  "$mediaSource", "$campaign", "$adGroup", "$ad", "$keyword", "$creative",
  "$appstackId",
]);

function extractAppstackAttrs(sub: any): Record<string, string> | null {
  const attrs = sub?.subscriber?.subscriber_attributes || {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (ATTRIBUTION_KEYS.has(k) || k.toLowerCase().includes("appstack")) {
      const val = (v as any)?.value;
      if (val && String(val).trim() !== "") out[k] = String(val);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

(async () => {
  const cutoffMs = Date.now() - DAYS * 24 * 60 * 60 * 1000;
  console.log(`\n▸ Scanning Users created since ${new Date(cutoffMs).toISOString().slice(0, 10)} (last ${DAYS} days)…\n`);

  const snap = await db
    .collection("Users")
    .where("created_at", ">=", new Date(cutoffMs))
    .select("email", "created_at", "user_type")
    .get();

  console.log(`  Found ${snap.size} users in window.\n  Querying RC for each…\n`);

  const uids = snap.docs.map(d => ({ uid: d.id, email: d.data().email, createdAt: d.data().created_at }));
  const attributed: Array<{ uid: string; email: string; attrs: Record<string, string> }> = [];
  const noAttrs: string[] = [];
  const notFound: string[] = [];

  for (let i = 0; i < uids.length; i += CONCURRENCY) {
    const batch = uids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async ({ uid, email }) => {
      const sub = await getSubscriber(uid);
      if (!sub) return { uid, email, status: "not_found" as const };
      const attrs = extractAppstackAttrs(sub);
      return { uid, email, attrs, status: attrs ? "attributed" : "no_attrs" as const };
    }));
    for (const r of results) {
      if (r.status === "attributed" && r.attrs) attributed.push({ uid: r.uid, email: r.email, attrs: r.attrs });
      else if (r.status === "no_attrs") noAttrs.push(r.uid);
      else notFound.push(r.uid);
    }
    process.stdout.write(`  Progress: ${Math.min(i + CONCURRENCY, uids.length)}/${uids.length}\r`);
  }
  console.log(`\n`);

  console.log(`━━━ Results ━━━`);
  console.log(`  Total scanned:            ${uids.length}`);
  console.log(`  Have Appstack attribution: ${attributed.length}`);
  console.log(`  No Appstack attrs:        ${noAttrs.length}`);
  console.log(`  Not found on RC:          ${notFound.length}\n`);

  if (attributed.length > 0) {
    console.log(`━━━ Sample of attributed installs (up to 20) ━━━`);
    for (const { uid, email, attrs } of attributed.slice(0, 20)) {
      console.log(`\n  ${email || uid}`);
      for (const [k, v] of Object.entries(attrs)) {
        console.log(`    ${k.padEnd(35)} = ${v}`);
      }
    }

    const byMedia: Record<string, number> = {};
    const byCampaign: Record<string, number> = {};
    const byAdGroup: Record<string, number> = {};
    for (const { attrs } of attributed) {
      const ms = attrs["$mediaSource"] || "(unset)";
      const c  = attrs["$campaign"]    || "(unset)";
      const ag = attrs["$adGroup"]     || "(unset)";
      byMedia[ms]    = (byMedia[ms]    || 0) + 1;
      byCampaign[c]  = (byCampaign[c]  || 0) + 1;
      byAdGroup[ag]  = (byAdGroup[ag]  || 0) + 1;
    }
    const dump = (label: string, m: Record<string, number>) => {
      console.log(`\n━━━ ${label} ━━━`);
      for (const [k, n] of Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
        console.log(`  ${String(n).padStart(4)}  ${k}`);
      }
    };
    dump("Breakdown by media source", byMedia);
    dump("Breakdown by campaign",     byCampaign);
    dump("Breakdown by ad group",     byAdGroup);
  } else {
    console.log(`━━━ No Appstack-attributed installs found in the last ${DAYS} days ━━━`);
    console.log(`  Possible reasons:`);
    console.log(`    - No paid Appstack ads running yet, or they haven't produced installs`);
    console.log(`    - Mobile app version deployed doesn't include setAppstackAttributionParams`);
    console.log(`    - ATT prompt denials + Appstack fallback not stitching (see Appstack dash)`);
  }

  process.exit(0);
})().catch((e: Error) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
