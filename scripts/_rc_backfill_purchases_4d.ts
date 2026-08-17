// Backfill RC attributes for users who CONVERTED (purchased) in the
// last 4 days. Uses converted_at as the filter, not created_at — different
// from _rc_backfill_72h.ts.
//
// Usage: APPLY=1 npx tsx scripts/_rc_backfill_purchases_4d.ts

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
const DAYS = 4;
const CONCURRENCY = 4;

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

async function pushToRc(userId: string, attrs: Record<string, { value: string }>) {
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
  console.log(`\n=== RC backfill — purchases in last ${DAYS}d — ${APPLY ? "APPLY" : "DRY"} ===\n`);
  const since = Timestamp.fromMillis(Date.now() - DAYS * 86_400_000);
  console.log(`Querying Users where converted_at >= ${since.toDate().toISOString()}…`);

  const snap = await db.collection("Users").where("converted_at", ">=", since).get();
  console.log(`Fetched ${snap.size} converted users.\n`);

  const updates: { userId: string; attrs: any; userType: string; converted: string }[] = [];
  const byType: Record<string, number> = {};
  let deleted = 0, noAttrs = 0;
  for (const doc of snap.docs) {
    const d: any = doc.data();
    if (d.is_deleted) { deleted++; continue; }
    const attrs = buildAttributes(d);
    if (Object.keys(attrs).length === 0) { noAttrs++; continue; }
    const ut = (d.user_type as string) || "unknown";
    byType[ut] = (byType[ut] || 0) + 1;
    updates.push({
      userId: doc.id,
      attrs,
      userType: ut,
      converted: d.converted_at?.toDate?.()?.toISOString() ?? "?",
    });
  }

  console.log(`Eligible: ${updates.length}`);
  console.log(`Skipped (is_deleted): ${deleted}`);
  console.log(`Skipped (no attrs):   ${noAttrs}`);
  console.log(`By user_type:`, byType);
  console.log(`\nReferral source distribution:`);
  const refSrc: Record<string, number> = {};
  for (const u of updates) {
    const v = u.attrs.referral_source?.value ?? "(blank)";
    refSrc[v] = (refSrc[v] || 0) + 1;
  }
  for (const [k, v] of Object.entries(refSrc).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }

  if (!APPLY) {
    console.log(`\nDRY — re-run with APPLY=1 to write.`);
    process.exit(0);
  }

  console.log(`\nWriting to RC…`);
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
    console.log(`First 5 failures:`);
    failures.slice(0, 5).forEach(f => console.log(`  ${f.userId} [${f.ut}] status=${f.status} ${f.body?.slice(0, 120)}`));
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
