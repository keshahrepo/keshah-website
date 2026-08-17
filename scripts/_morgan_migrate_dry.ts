import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "2KS4YWgW2LNS8DD5oNcMd1vMePA3";
const REGROWTH_START_DATE = "2026-05-05"; // From regrowth_switched_at_date "05/05/2026"
const APPLY = process.argv.includes("--apply");

// Returns regrowth-relative day (1-indexed) for a given YYYY-MM-DD date.
function regrowthDayFor(dateStr: string): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = Date.UTC(y, m - 1, d);
  const [sy, sm, sd] = REGROWTH_START_DATE.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const diff = Math.round((target - start) / 86400000);
  return diff + 1;
}

(async () => {
  const ref = db.collection("Users").doc(UID);
  const snap = await ref.get();
  const u: any = snap.data();
  const rp: Record<string, any> = u.regrowth_progress || {};

  // Group keys by whether they're "small" (regrowth-relative) or "large" (absolute).
  // Anything >= 50 is treated as absolute since the regrowth window opened 18 days ago.
  const absoluteKeys = Object.keys(rp).filter((k) => {
    const n = parseInt(k.replace("day", ""), 10);
    return n >= 50;
  });

  console.log(`Found ${absoluteKeys.length} absolute-day keys to migrate.`);
  console.log("");

  const moves: Array<{ from: string; to: string; date: string }> = [];
  const collisions: string[] = [];

  for (const key of absoluteKeys) {
    const entry = rp[key];
    if (!Array.isArray(entry) || entry.length === 0) {
      console.log(`  ${key}: empty/non-array, skipping`);
      continue;
    }
    // Use the first exercise's completed_date to determine the real date.
    const completedDate = entry.find((e: any) => e?.completed_date)?.completed_date;
    if (!completedDate) {
      // For day357 (today's in-progress entry, no completion yet) — infer
      // from key offset against the latest dated entry.
      const datedKeys = absoluteKeys
        .filter((k) => {
          const e = rp[k];
          return Array.isArray(e) && e.some((x: any) => x?.completed_date);
        })
        .map((k) => {
          const e = rp[k];
          const dt = e.find((x: any) => x?.completed_date).completed_date;
          return { key: k, abs: parseInt(k.replace("day", ""), 10), date: dt };
        });
      if (datedKeys.length === 0) {
        console.log(`  ${key}: no completed_date and no anchors, skipping`);
        continue;
      }
      // Pick the latest dated anchor and offset.
      const anchor = datedKeys.sort((a, b) => b.abs - a.abs)[0];
      const thisAbs = parseInt(key.replace("day", ""), 10);
      const offsetFromAnchor = thisAbs - anchor.abs;
      const [ay, am, ad] = anchor.date.split("-").map(Number);
      const anchorTs = Date.UTC(ay, am - 1, ad);
      const inferredTs = anchorTs + offsetFromAnchor * 86400000;
      const inferredDate = new Date(inferredTs).toISOString().slice(0, 10);
      const rgDay = regrowthDayFor(inferredDate);
      console.log(`  ${key}: NO completed_date — inferred ${inferredDate} → regrowth day${rgDay}`);
      if (rgDay && rgDay > 0) {
        moves.push({ from: key, to: `day${rgDay}`, date: inferredDate });
      }
      continue;
    }
    const rgDay = regrowthDayFor(completedDate);
    if (!rgDay || rgDay <= 0) {
      console.log(`  ${key}: completed_date ${completedDate} → invalid regrowth day, skipping`);
      continue;
    }
    const newKey = `day${rgDay}`;
    if (rp[newKey] !== undefined) {
      collisions.push(`${key} → ${newKey} (target already exists)`);
      console.log(`  ${key} → ${newKey}: COLLISION, target exists`);
      continue;
    }
    moves.push({ from: key, to: newKey, date: completedDate });
    console.log(`  ${key} → ${newKey} (completed ${completedDate})`);
  }

  console.log("");
  console.log(`Plan: ${moves.length} moves, ${collisions.length} collisions`);
  if (collisions.length > 0) {
    console.log("Collisions:");
    collisions.forEach((c) => console.log("  " + c));
  }

  if (!APPLY) {
    console.log("");
    console.log("DRY RUN — pass --apply to execute.");
    process.exit(0);
  }

  console.log("");
  console.log("Applying...");
  const updates: Record<string, any> = {};
  const FieldValueDelete = (await import("firebase-admin/firestore")).FieldValue.delete();
  for (const m of moves) {
    updates[`regrowth_progress.${m.to}`] = rp[m.from];
    updates[`regrowth_progress.${m.from}`] = FieldValueDelete;
  }
  await ref.update(updates);
  console.log(`✓ Applied ${moves.length} key moves`);
  process.exit(0);
})().catch((e: any) => { console.error(e); process.exit(1); });
