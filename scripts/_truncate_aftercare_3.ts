// Truncate aftercare_progress for the 3 doc-size-broken VIPs.
// Keep last 65 days of progress (recent ~9 weeks), delete older.
// This drops doc size below the 1MB Firestore limit so writes succeed.
//
// Preserves a lifetime completion count on the user doc so we don't lose
// long-term streak visibility.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT||"","base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const KEEP_LAST_DAYS = 65;

const TARGETS = [
  { uid: "NtFTj5PCTGYUGLLx9xPMnEVXUMb2", email: "najinthant@gmail.com" },
  // josephalber + richujacob7 — need their UIDs. Look them up by email.
  { email: "josephalber@live.com" },
  { email: "richujacob7@gmail.com" },
] as { uid?: string; email: string }[];

async function resolveUid(t: { uid?: string; email: string }): Promise<string|null> {
  if (t.uid) return t.uid;
  const snap = await db.collection("Users").where("email","==",t.email).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function truncateOne(uid: string, email: string) {
  console.log(`\n══ ${email} (${uid}) ══`);
  const ref = db.collection("Users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) { console.log(`  ✗ doc not found`); return; }
  const x:any = snap.data();
  const sizeBefore = JSON.stringify(x).length;
  console.log(`  Before: ${(sizeBefore/1024).toFixed(1)} KB`);

  const ac = (x.aftercare_progress || {}) as Record<string, any>;
  const keys = Object.keys(ac).filter(k => /^day\d+$/.test(k));
  if (keys.length === 0) { console.log(`  no aftercare_progress entries — skip`); return; }

  const nums = keys.map(k => parseInt(k.slice(3), 10)).sort((a,b)=>a-b);
  const maxDay = nums[nums.length - 1];
  const cutoff = Math.max(1, maxDay - KEEP_LAST_DAYS + 1);

  const keepKeys: string[] = [];
  const deleteKeys: string[] = [];
  // Lifetime completion count (preserved before delete)
  let lifetimeCompleted = 0;
  for (const k of keys) {
    const n = parseInt(k.slice(3), 10);
    const entry = ac[k];
    const isCompleted = Array.isArray(entry) && entry.some((e:any)=>e?.is_completed === true);
    if (isCompleted) lifetimeCompleted++;
    if (n >= cutoff) keepKeys.push(k);
    else deleteKeys.push(k);
  }

  console.log(`  Day range:        ${nums[0]}..${maxDay}`);
  console.log(`  Cutoff:           day${cutoff} (keep day${cutoff}..${maxDay})`);
  console.log(`  Keep:             ${keepKeys.length} entries`);
  console.log(`  Delete:           ${deleteKeys.length} entries`);
  console.log(`  Lifetime done:    ${lifetimeCompleted} days had ≥1 completed exercise`);

  if (deleteKeys.length === 0) { console.log(`  nothing to truncate`); return; }

  // Batch the field deletes via dot-notation. Firestore update accepts
  // many keys at once but we cap to ~400 keys per update to stay safe.
  const updates: Record<string, any> = {};
  for (const k of deleteKeys) updates[`aftercare_progress.${k}`] = FieldValue.delete();
  // Also preserve the lifetime count (write the absolute value; earlier
  // attempts tried FieldValue.increment(0).isEqual which was a dead-code
  // ternary — always resolved to the same value and blocked the deploy).
  updates["aftercare_lifetime_completed_days"] = lifetimeCompleted;
  updates["aftercare_truncated_at"] = FieldValue.serverTimestamp();
  updates["aftercare_truncated_below_day"] = cutoff;
  updates["modified_at"] = FieldValue.serverTimestamp();

  // Chunk if needed
  const allKeys = Object.keys(updates);
  console.log(`  Writing ${allKeys.length} field updates…`);
  const CHUNK = 400;
  for (let i = 0; i < allKeys.length; i += CHUNK) {
    const chunkObj: Record<string, any> = {};
    for (const k of allKeys.slice(i, i+CHUNK)) chunkObj[k] = updates[k];
    await ref.update(chunkObj);
  }

  // Re-read to verify
  const after = (await ref.get()).data();
  const sizeAfter = JSON.stringify(after).length;
  const acAfter = (after as any)?.aftercare_progress || {};
  const acAfterKeys = Object.keys(acAfter).filter(k=>/^day\d+$/.test(k)).length;

  console.log(`  After:  ${(sizeAfter/1024).toFixed(1)} KB (was ${(sizeBefore/1024).toFixed(1)})`);
  console.log(`  Saved:  ${((sizeBefore-sizeAfter)/1024).toFixed(1)} KB`);
  console.log(`  aftercare_progress now has: ${acAfterKeys} entries`);
  console.log(`  Under 1MB limit:            ${sizeAfter < 1048576 ? "✓ YES" : "✗ NO"}`);
}

(async () => {
  console.log(`Truncating aftercare_progress for ${TARGETS.length} broken VIPs`);
  console.log(`Keep last ${KEEP_LAST_DAYS} days, delete older`);
  for (const t of TARGETS) {
    const uid = await resolveUid(t);
    if (!uid) { console.log(`\n── ${t.email} — UID NOT FOUND, skip`); continue; }
    await truncateOne(uid, t.email);
  }
  console.log(`\n✅ Done.`);
})();
