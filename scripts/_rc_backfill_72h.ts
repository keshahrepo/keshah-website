// Backfill RC attributes for users created in the last 72h, across ALL
// user types. Uses created_at as the primary Firestore filter so the
// fetch is small (won't ECONNRESET on the giant freev2 collection).
//
// Usage: npx tsx scripts/_rc_backfill_72h.ts                  # dry
//        APPLY=1 npx tsx scripts/_rc_backfill_72h.ts          # write

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_SECRET = process.env.RC_SECRET_KEY!;
if (!RC_SECRET) { console.error("RC_SECRET_KEY missing"); process.exit(1); }

const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const HOURS = 72;
const CONCURRENCY = 4;

const ATTRIBUTE_KEYS = [
  "referral_source", "selected_gender", "conversion_source",
  "first_name", "signup_timezone", "user_type", "treatment_stage",
] as const;

function buildAttributes(d: any): Record<string, { value: string }> {
  const out: Record<string, { value: string }> = {};
  const firstName = d.first_name ?? d.name;
  const pairs: [string, any][] = [
    ["referral_source", d.referral_source],
    ["selected_gender", d.selected_gender],
    ["conversion_source", d.conversion_source],
    ["first_name", firstName],
    ["signup_timezone", d.userLocalTimeZone],
    ["user_type", d.user_type],
    ["treatment_stage", d.treatment_stage],
  ];
  for (const [k, v] of pairs) {
    if (typeof v === "string" && v.length > 0) out[k] = { value: v };
  }
  return out;
}

async function pushToRc(userId: string, attrs: Record<string, { value: string }>): Promise<{ ok: boolean; status: number; body?: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}/attributes`,
        { method: "POST", headers: { Authorization: `Bearer ${RC_SECRET}`, "Content-Type": "application/json" },
          body: JSON.stringify({ attributes: attrs }) }
      );
      if (res.ok) return { ok: true, status: res.status };
      const body = await res.text().catch(() => "");
      if (res.status === 429 && attempt < 2) { await new Promise(r => setTimeout(r, 500 + attempt * 500)); continue; }
      return { ok: false, status: res.status, body };
    } catch (e: any) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 250 + attempt * 250)); continue; }
      return { ok: false, status: 0, body: e.message };
    }
  }
  return { ok: false, status: 0, body: "exhausted retries" };
}

(async () => {
  console.log(`\n=== RC backfill — last ${HOURS}h — ${APPLY ? "APPLY" : "DRY"} ===\n`);
  const since = Timestamp.fromMillis(Date.now() - HOURS * 3_600_000);
  console.log(`Querying Users where created_at >= ${since.toDate().toISOString()}…`);

  const snap = await db.collection("Users").where("created_at", ">=", since).get();
  console.log(`Fetched ${snap.size} user docs.\n`);

  const updates: { userId: string; attrs: any; userType: string }[] = [];
  const byType: Record<string, number> = {};
  let deleted = 0, noAttrs = 0;
  for (const doc of snap.docs) {
    const d: any = doc.data();
    if (d.is_deleted) { deleted++; continue; }
    const attrs = buildAttributes(d);
    if (Object.keys(attrs).length === 0) { noAttrs++; continue; }
    const ut = (d.user_type as string) || "unknown";
    byType[ut] = (byType[ut] || 0) + 1;
    updates.push({ userId: doc.id, attrs, userType: ut });
  }

  console.log(`Eligible: ${updates.length}`);
  console.log(`Skipped (is_deleted): ${deleted}`);
  console.log(`Skipped (no attrs):   ${noAttrs}`);
  console.log(`By user_type:`, byType, `\n`);

  if (!APPLY) {
    console.log(`DRY — re-run with APPLY=1 to write. Sample (first 5):`);
    for (const u of updates.slice(0, 5)) {
      console.log(`  ${u.userId} [${u.userType}]: ${Object.entries(u.attrs).map(([k, v]: any) => `${k}=${v.value}`).join(", ")}`);
    }
    process.exit(0);
  }

  console.log(`Writing to RC…`);
  let ok = 0, fail = 0;
  const failures: any[] = [];
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const slice = updates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map(u => pushToRc(u.userId, u.attrs)));
    results.forEach((r, idx) => {
      if (r.ok) ok++;
      else { fail++; failures.push({ userId: slice[idx].userId, ut: slice[idx].userType, status: r.status, body: r.body }); }
    });
    if (i % 100 === 0 && i > 0) console.log(`  …${i}/${updates.length}  ok=${ok} fail=${fail}`);
  }

  console.log(`\nDone. ok=${ok} fail=${fail}`);
  if (fail > 0) {
    console.log(`Failures by type:`);
    const byTypeFail: Record<string, number> = {};
    for (const f of failures) byTypeFail[f.ut] = (byTypeFail[f.ut] || 0) + 1;
    console.log(byTypeFail);
    console.log(`\nFirst 5 failures:`);
    failures.slice(0, 5).forEach(f => console.log(`  ${f.userId} [${f.ut}] status=${f.status} ${f.body?.slice(0, 120)}`));
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
