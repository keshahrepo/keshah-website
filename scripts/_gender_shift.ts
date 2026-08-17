import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function windowStats(hours: number) {
  const cutoff = Timestamp.fromMillis(Date.now() - hours * 60 * 60 * 1000);
  const snap = await db.collection("Users").where("created_at", ">=", cutoff).get();
  let f = 0, m = 0, unset = 0;
  const byRef: Record<string, { f: number; m: number }> = {};
  for (const d of snap.docs) {
    const u: any = d.data();
    const r = (u.referral_source as string | undefined) ?? "(unset)";
    if (!byRef[r]) byRef[r] = { f: 0, m: 0 };
    if (u.selected_gender === 'female') { f++; byRef[r].f++; }
    else if (u.selected_gender === 'male') { m++; byRef[r].m++; }
    else unset++;
  }
  const known = f + m;
  return { total: snap.size, f, m, unset, fPct: known ? (f/known*100) : 0, byRef };
}

(async () => {
  const windows = [
    { label: "Last 24h",  hours: 24 },
    { label: "Last 3d",   hours: 72 },
    { label: "Last 7d",   hours: 168 },
    { label: "Last 14d",  hours: 336 },
    { label: "Last 20d",  hours: 480 },
    { label: "Last 30d",  hours: 720 },
  ];

  console.log(`Window      | Signups | Female | Male  | Unset | F%   `);
  console.log(`------------|---------|--------|-------|-------|------`);
  for (const w of windows) {
    const s = await windowStats(w.hours);
    console.log(
      `${w.label.padEnd(11)} | ${String(s.total).padStart(7)} | ${String(s.f).padStart(6)} | ${String(s.m).padStart(5)} | ${String(s.unset).padStart(5)} | ${s.fPct.toFixed(1).padStart(4)}%`
    );
  }

  // Show new-option detection — referral picks that suggest the new app
  // build with creator names is actually live.
  console.log(`\nNew creator-attribution picks (last 24h):`);
  const s24 = await windowStats(24);
  const newOpts = ['founder_aadi', 'educator_jennifer', 'educator_donna', 'educator_isai', 'friend_or_family', 'healthcare_professional'];
  for (const opt of newOpts) {
    const r = s24.byRef[opt];
    if (r) console.log(`  ${opt}: ${r.f + r.m} (F: ${r.f}, M: ${r.m})`);
  }

  console.log(`\nOld options still picked (last 24h):`);
  for (const opt of ['tiktok', 'instagram']) {
    const r = s24.byRef[opt];
    if (r) console.log(`  ${opt}: ${r.f + r.m} (F: ${r.f}, M: ${r.m})`);
  }

  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
