// Backfill: write `format` and `hook_family` on ProvenVideos from the
// founder's tagging file (tagged.json: [{ id, format, family, ... }]).
// The daily picks read them: hook_family drives the 21-day no-repeat window
// (wins over the computed family) and format drives the full creators' mix
// (2 self-tests + 1 other a day). Format names are normalised to
// PROVEN_FORMATS ("list/plan" -> "list", "personal story" -> "personal-story").
//
// Only writes fields that differ; docs missing from Firestore and unknown
// formats are listed, never created. Dry run unless --apply.
//
// Usage:
//   set -a; source .env.local; set +a
//   npx tsx scripts/_backfill_proven_tags.ts <path/to/tagged.json>            # dry run
//   npx tsx scripts/_backfill_proven_tags.ts <path/to/tagged.json> --apply    # write

import { readFileSync } from "node:fs";
import { getFirebaseAdmin } from "../lib/firebase-admin";
import { PROVEN_COLLECTION, normalizeFormat } from "../lib/creators/proven";

interface Tagged {
  id: string;
  format?: string;
  family?: string;
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  if (!file) throw new Error("Pass the path to tagged.json");
  const rows = JSON.parse(readFileSync(file, "utf8")) as Tagged[];
  if (!Array.isArray(rows)) throw new Error("tagged.json must be an array");

  const { db } = getFirebaseAdmin();
  const col = db.collection(PROVEN_COLLECTION);
  const snaps = await db.getAll(...rows.map((r) => col.doc(r.id)));

  const missing: string[] = [];
  const badFormat: string[] = [];
  const updates: { id: string; patch: Record<string, string> }[] = [];
  snaps.forEach((s, i) => {
    const r = rows[i];
    if (!s.exists) return void missing.push(r.id);
    const d = s.data()!;
    const patch: Record<string, string> = {};
    const format = normalizeFormat(r.format);
    if (r.format && !format) badFormat.push(`${r.id}: ${r.format}`);
    if (format && d.format !== format) patch.format = format;
    const family = String(r.family ?? "").replace(/\s+/g, " ").trim();
    if (family && d.hook_family !== family) patch.hook_family = family;
    if (Object.keys(patch).length) updates.push({ id: r.id, patch });
  });

  console.log(`${rows.length} tagged, ${updates.length} to update, ${missing.length} not in Firestore, ${badFormat.length} unknown formats`);
  for (const m of missing) console.log(`  missing: ${m}`);
  for (const b of badFormat) console.log(`  unknown format: ${b}`);
  for (const u of updates.slice(0, 10)) console.log(`  ${u.id}: ${JSON.stringify(u.patch)}`);
  if (!apply) {
    console.log("Dry run. Re-run with --apply to write.");
    return;
  }
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 400)) batch.update(col.doc(u.id), u.patch);
    await batch.commit();
  }
  console.log(`Wrote ${updates.length} docs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
