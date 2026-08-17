// Backfill RevenueCat subscriber attributes from Firestore User docs.
//
// Why this exists: until 2026-06-04 the mobile app did not tag RC subscribers
// with referral_source / selected_gender / conversion_source. Historical
// subscribers exist in RC but have no attribution attributes, so RC dashboards
// and the REST API can't answer "how much revenue did Jennifer drive."
//
// This script reads every Firestore User doc that looks like it might have a
// matching RC subscriber and pushes their attribution attributes to RC.
//
// Defaults to DRY RUN — prints what would be written without actually calling
// RC. Pass --apply (or set APPLY=1) to write for real.
//
// Tunable knobs:
//   --limit=N       only process N users (useful for sampling)
//   --concurrency=N parallel RC writes (default 4, max 16)
//   --since=DAYS    only users created within last N days
//   --user-type=X   filter by user_type (default freev2)
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_backfill_rc_attributes.ts                # dry run
//   npx tsx scripts/_backfill_rc_attributes.ts --limit=20     # 20-user dry sample
//   APPLY=1 npx tsx scripts/_backfill_rc_attributes.ts        # real run

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const RC_SECRET = process.env.RC_SECRET_KEY || "";
if (!RC_SECRET) {
  console.error("RC_SECRET_KEY env var is not set");
  process.exit(1);
}

// CLI parsing
const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a === `--${name}`) !== undefined;
const flagVal = (name: string): string | undefined => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : undefined;
};

const APPLY = process.env.APPLY === "1" || flag("apply");
const LIMIT = flagVal("limit") ? parseInt(flagVal("limit")!, 10) : Number.MAX_SAFE_INTEGER;
const CONCURRENCY = Math.min(16, Math.max(1, parseInt(flagVal("concurrency") ?? "4", 10)));
const SINCE_DAYS = flagVal("since") ? parseInt(flagVal("since")!, 10) : null;
const USER_TYPE = flagVal("user-type") ?? "freev2";

// Whitelist of attribute keys we'll push. Anything else is ignored — we don't
// want to leak random Firestore fields into RC's permanent attribute store.
const ATTRIBUTE_KEYS = [
  "referral_source",
  "selected_gender",
  "conversion_source",
  "first_name",
  "signup_timezone",
  "user_type",
  "treatment_stage",
] as const;

type Attr = { value: string };
type RcUpdate = { userId: string; attrs: Record<string, Attr> };

function buildAttributes(d: Record<string, unknown>): Record<string, Attr> {
  const out: Record<string, Attr> = {};
  const tz = d.userLocalTimeZone as string | undefined;
  const firstName = (d.first_name as string | undefined) ?? (d.name as string | undefined);
  const pairs: [string, string | undefined][] = [
    ["referral_source", d.referral_source as string | undefined],
    ["selected_gender", d.selected_gender as string | undefined],
    ["conversion_source", d.conversion_source as string | undefined],
    ["first_name", firstName],
    ["signup_timezone", tz],
    ["user_type", d.user_type as string | undefined],
    ["treatment_stage", d.treatment_stage as string | undefined],
  ];
  for (const [k, v] of pairs) {
    if (!ATTRIBUTE_KEYS.includes(k as typeof ATTRIBUTE_KEYS[number])) continue;
    if (v && typeof v === "string" && v.length > 0) out[k] = { value: v };
  }
  return out;
}

async function pushToRc(userId: string, attrs: Record<string, Attr>): Promise<{ ok: boolean; status: number; body?: string }> {
  // NOTE: do NOT include X-Platform header — it triggers RC's "Secret API
  // keys should not be used in your app" guard (code 7243), since X-Platform
  // is meant for SDK-side requests using a public key.
  //
  // Wrap fetch in a try/catch with a small retry. Transient network errors
  // ("fetch failed", DNS hiccups, TLS resets) used to kill the whole batch
  // via Promise.all — that's how the first apply-run died at 24K/62K.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}/attributes`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RC_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ attributes: attrs }),
      });
      if (res.ok) return { ok: true, status: res.status };
      const body = await res.text().catch(() => "");
      // 429 = rate limit. Back off briefly and retry.
      if (res.status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 + attempt * 500));
        continue;
      }
      return { ok: false, status: res.status, body };
    } catch (e) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 250 + attempt * 250));
        continue;
      }
      return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
    }
  }
  return { ok: false, status: 0, body: "exhausted retries" };
}

async function processBatch(updates: RcUpdate[]): Promise<{ ok: number; fail: number; failures: { userId: string; status: number; body?: string }[] }> {
  let ok = 0;
  let fail = 0;
  const failures: { userId: string; status: number; body?: string }[] = [];
  // Simple bounded concurrency via a chunk-and-await pattern.
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const slice = updates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map((u) => pushToRc(u.userId, u.attrs)));
    results.forEach((r, idx) => {
      if (r.ok) ok++;
      else {
        fail++;
        failures.push({ userId: slice[idx].userId, status: r.status, body: r.body });
      }
    });
    if (i % (CONCURRENCY * 25) === 0 && i > 0) {
      console.log(`  …${i}/${updates.length}  ok=${ok} fail=${fail}`);
    }
  }
  return { ok, fail, failures };
}

(async () => {
  console.log(`\n=== RC attribute backfill — ${APPLY ? "APPLY (writes will happen)" : "DRY RUN (no writes)"} ===\n`);
  console.log(`  user_type filter:    ${USER_TYPE}`);
  console.log(`  since (days):        ${SINCE_DAYS ?? "(all time)"}`);
  console.log(`  limit:               ${LIMIT === Number.MAX_SAFE_INTEGER ? "(no limit)" : LIMIT}`);
  console.log(`  concurrency:         ${CONCURRENCY}\n`);

  // Single equality filter (avoids needing a composite index for user_type +
  // created_at). Date-window filter is applied in-memory after fetch.
  console.log(`Fetching Users… (this can take a moment)`);
  const snap = await db.collection("Users").where("user_type", "==", USER_TYPE).get();
  console.log(`Found ${snap.size} user docs with user_type=${USER_TYPE}.\n`);

  const sinceMs = SINCE_DAYS != null ? Date.now() - SINCE_DAYS * 86_400_000 : null;
  const updates: RcUpdate[] = [];
  const skipped = { deleted: 0, noAttributes: 0, outOfWindow: 0 };

  for (const doc of snap.docs) {
    if (updates.length >= LIMIT) break;
    const d = doc.data();
    if (d.is_deleted) { skipped.deleted++; continue; }
    if (sinceMs != null) {
      const c = (d.created_at as Timestamp | undefined)?.toMillis?.();
      if (c == null || c < sinceMs) { skipped.outOfWindow++; continue; }
    }
    const attrs = buildAttributes(d);
    if (Object.keys(attrs).length === 0) { skipped.noAttributes++; continue; }
    updates.push({ userId: doc.id, attrs });
  }

  console.log(`Eligible for backfill: ${updates.length}`);
  console.log(`Skipped (is_deleted):    ${skipped.deleted}`);
  console.log(`Skipped (out of window): ${skipped.outOfWindow}`);
  console.log(`Skipped (no attrs):      ${skipped.noAttributes}\n`);

  // Distribution preview
  const distribution: Record<string, Record<string, number>> = {};
  for (const k of ATTRIBUTE_KEYS) distribution[k] = {};
  for (const u of updates) {
    for (const [k, v] of Object.entries(u.attrs)) {
      const dk = distribution[k] ?? {};
      dk[v.value] = (dk[v.value] ?? 0) + 1;
      distribution[k] = dk;
    }
  }
  console.log(`=== Attribute value distribution across ${updates.length} subscribers ===`);
  for (const [k, vals] of Object.entries(distribution)) {
    const top = Object.entries(vals).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const totalPresent = Object.values(vals).reduce((a, b) => a + b, 0);
    console.log(`  ${k.padEnd(20)} present on ${totalPresent}/${updates.length}`);
    for (const [v, c] of top) console.log(`    ${String(v).padEnd(28)} ${c}`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — re-run with APPLY=1 or --apply to actually push to RC.`);
    console.log(`Sample of what would be sent (first 5 users):`);
    updates.slice(0, 5).forEach((u) => {
      console.log(`  user=${u.userId}`);
      for (const [k, v] of Object.entries(u.attrs)) console.log(`    ${k}: ${v.value}`);
    });
    process.exit(0);
  }

  console.log(`\nWriting to RevenueCat…`);
  const { ok, fail, failures } = await processBatch(updates);
  console.log(`\nDone. ok=${ok} fail=${fail}`);
  if (fail > 0) {
    console.log(`\nFirst 10 failures:`);
    failures.slice(0, 10).forEach((f) => console.log(`  user=${f.userId} status=${f.status} body=${f.body?.slice(0, 200)}`));
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
