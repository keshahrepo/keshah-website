// One-off: bring Isai's existing ContentCreators doc onto the new creator pay /
// portal model.
//
//   npx tsx scripts/migrate-isai-creator.ts --key=/path/to/serviceAccount.json            # dry run (default): prints the plan, writes nothing
//   npx tsx scripts/migrate-isai-creator.ts --key=... --id=<ContentCreators id>           # pick a doc when several match
//   npx tsx scripts/migrate-isai-creator.ts --key=... --id=<id> --apply                   # actually write
//
// Sets on ContentCreators/{id}:
//   start_date "2026-10-01", start_mode removed (legacy), starting_completed_months 1,
//   status "active", campaign_tags = existing + every distinct Users.attribution_campaign
//   value containing "isai" (read-only scan, printed with counts).
// Sets on ContentCreators/{id}/onboarding/state (merge):
//   completed_at / ready_at = now (only if not already complete), migrated: true, migrated_at.
//   contract_signed_at only if the doc already records a signed (paper) contract.
// Leaves the contract itself untouched.
//
// Personal emails / phones are never printed.

import { readFileSync } from "fs";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type DocumentData, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : "true"];
  }),
) as Record<string, string>;

const APPLY = args.apply === "true";
const KEY = args.key;
const ID = args.id;
const NEEDLE = "isai";

const PLAN = {
  start_date: "2026-10-01",
  starting_completed_months: 1,
  status: "active",
};

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/** Case- and accent-insensitive ("Isaí" matches). */
function has(v: unknown): boolean {
  return typeof v === "string" && v.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(NEEDLE);
}

function iso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  const t = v as { toDate?: () => Date };
  return typeof t.toDate === "function" ? t.toDate().toISOString() : null;
}

async function campaignValues(db: Firestore): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let last: QueryDocumentSnapshot | undefined;
  let scanned = 0;
  for (;;) {
    let q = db.collection("Users").orderBy("__name__").select("attribution_campaign").limit(5000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const v = d.get("attribution_campaign");
      if (has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    scanned += snap.size;
    last = snap.docs[snap.docs.length - 1];
    process.stderr.write(`\r  scanned ${scanned} Users...`);
    if (snap.size < 5000) break;
  }
  process.stderr.write("\n");
  return counts;
}

function describe(id: string, d: DocumentData, onb: DocumentData | null): string {
  const c = (d.contract ?? {}) as DocumentData;
  return [
    `  id: ${id}`,
    `    name: ${d.name ?? ""}   legal_name: ${d.legal_name ?? ""}`,
    `    status: ${d.status ?? "(none)"}   is_active: ${d.is_active}`,
    `    start_date: ${d.start_date ?? "(none)"}   start_mode: ${d.start_mode ?? "(absent)"}   trial_start_date: ${d.trial_start_date ?? "(none)"}`,
    `    starting_completed_months: ${d.starting_completed_months ?? "(none)"}`,
    `    campaign_tags: ${JSON.stringify(d.campaign_tags ?? [])}`,
    `    contract: status=${c.status ?? "(none)"} template_version=${c.template_version ?? "-"} signed_at=${iso(c.signed_at) ?? "-"} pdf=${c.pdf_path ? "yes" : "no"}`,
    `    has password: ${!!d.password_hash}   keshah_email set: ${!!d.keshah_email}`,
    `    onboarding/state: ${onb ? `exists, completed_at=${onb.completed_at ?? "-"}` : "(none)"}`,
  ].join("\n");
}

async function main() {
  if (!KEY) die("Pass --key=/path/to/serviceAccount.json");
  const sa = JSON.parse(readFileSync(KEY, "utf8"));
  initializeApp({ credential: cert(sa) });
  const db = getFirestore();
  console.log(`Project: ${sa.project_id}   Mode: ${APPLY ? "APPLY (will write)" : "DRY RUN (read-only)"}\n`);

  // ---- find the creator
  const all = await db.collection("ContentCreators").get();
  const matches = all.docs.filter((d) => has(d.get("name")) || has(d.get("legal_name")) || has(d.get("email")));
  console.log(`ContentCreators matching "${NEEDLE}" (name / legal_name / email): ${matches.length}`);
  for (const m of matches) {
    const onb = await m.ref.collection("onboarding").doc("state").get();
    console.log(describe(m.id, m.data(), onb.exists ? onb.data()! : null));
  }
  console.log("");

  const target = ID ? all.docs.find((d) => d.id === ID) : matches.length === 1 ? matches[0] : undefined;
  if (ID && !target) die(`No ContentCreators doc with id ${ID}`);

  // ---- campaign values (read-only); printed even when the creator isn't found
  console.log(`Scanning Users.attribution_campaign for values containing "${NEEDLE}" (read-only)...`);
  const counts = await campaignValues(db);
  const values = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!values.length) console.log("  (none found)");
  for (const [v, n] of values) console.log(`  ${JSON.stringify(v)}: ${n}`);
  console.log("");

  if (!target) {
    if (matches.length) die("More than one ContentCreators match. Re-run with --id=<id>.");
    // Old short-link docs (Creators) only, to help locate him; never migrated by this script.
    const links = (await db.collection("Creators").get()).docs.filter((d) => has(d.get("name")) || has(d.get("slug")));
    console.log(`No ContentCreators doc matches. Creators (short-link) docs matching "${NEEDLE}": ${links.length}`);
    for (const l of links) {
      const linked = all.docs.filter((d) => d.get("creator_link_id") === l.id).map((d) => d.id);
      console.log(`  Creators/${l.id}  name: ${l.get("name") ?? ""}  slug: ${l.get("slug") ?? ""}  linked ContentCreators: ${linked.join(", ") || "(none)"}`);
    }
    die("\nNothing to migrate. Add Isai in the admin (or pass --id=<ContentCreators id> if his doc uses another name), then re-run.");
  }

  // ---- plan
  const d = target.data();
  const ref = target.ref;
  const onbSnap = await ref.collection("onboarding").doc("state").get();
  const onb = onbSnap.exists ? onbSnap.data()! : null;
  const now = new Date().toISOString();
  const existingTags: string[] = Array.isArray(d.campaign_tags) ? d.campaign_tags.map(String) : [];
  const tags = [...new Set([...existingTags, ...values.map(([v]) => v)])];

  const creatorUpdate: Record<string, unknown> = {
    start_date: PLAN.start_date,
    starting_completed_months: PLAN.starting_completed_months,
    status: PLAN.status,
    campaign_tags: tags,
    // Isai already has a full Workspace account, so Accept must not try to
    // create a group at that address: mark the group step done up front.
    keshah_email: "isai@keshah.com",
    "accept.steps.group": { status: "done", at: new Date().toISOString(), detail: "Existing Workspace account isai@keshah.com" },
  };
  if (d.start_mode !== undefined) creatorUpdate.start_mode = FieldValue.delete();
  if (d.status !== PLAN.status) creatorUpdate.status_changed_at = FieldValue.serverTimestamp();
  creatorUpdate.updated_at = FieldValue.serverTimestamp();

  const contract = (d.contract ?? {}) as DocumentData;
  const paperSigned = contract.status === "signed";
  const onbUpdate: Record<string, unknown> = { migrated: true, migrated_at: now };
  if (!onb?.completed_at) {
    onbUpdate.completed_at = now;
    onbUpdate.ready_at = now;
  }
  if (paperSigned && !onb?.contract_signed_at) onbUpdate.contract_signed_at = iso(contract.signed_at) ?? now;

  const show = (o: Record<string, unknown>) =>
    Object.entries(o)
      .map(([k, v]) => {
        const s = v instanceof FieldValue ? (k === "start_mode" ? "<delete field>" : "<server timestamp>") : JSON.stringify(v);
        return `    ${k}: ${s}`;
      })
      .join("\n");

  console.log(`PLAN for ContentCreators/${target.id} (${d.name ?? d.legal_name ?? ""})`);
  console.log(`  ContentCreators/${target.id} update:`);
  console.log(show(creatorUpdate));
  console.log(`  ContentCreators/${target.id}/onboarding/state set (merge):`);
  console.log(show(onbUpdate));
  console.log(
    `  contract: left as-is (status=${contract.status ?? "none"}${contract.template_version ? `, version ${contract.template_version}` : ""})` +
      (paperSigned ? "; signed record found, so the onboarding contract step is ticked from it" : "; no signed contract record"),
  );
  console.log("");

  // Weekdays from their Oct 1 start until they could log in the portal, all paid
  // as approved days. Oct 1, 2: no posts while setup was being finished.
  // Oct 5: they posted, but had no portal access yet to log the links.
  const CREDITED: Record<string, string> = {
    "2026-10-01": "Credited: portal setup still in progress",
    "2026-10-02": "Credited: portal setup still in progress",
    "2026-10-05": "Posted, before portal access to log links",
  };
  console.log("  days_off approved (credited):");
  for (const [date, reason] of Object.entries(CREDITED)) console.log(`    ${date}: ${reason}`);

  if (!APPLY) {
    console.log("Dry run only. Nothing was written. Re-run with --apply (and --id if needed) to write.");
    return;
  }
  const batch = db.batch();
  batch.update(ref, creatorUpdate);
  batch.set(ref.collection("onboarding").doc("state"), onbUpdate, { merge: true });
  for (const [date, reason] of Object.entries(CREDITED)) {
    batch.set(ref.collection("days_off").doc(date), { date, status: "approved", reason, requested_at: now, decided_at: now });
  }
  await batch.commit();
  console.log("Applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
