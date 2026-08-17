// Bulk-message regrowth kit buyers who haven't activated yet (kit hasn't
// arrived / not scanned). Customs-delay update.
//
// Dry-run by default. Pass --apply to actually send.
//
// Usage:
//   npx tsx scripts/_msg_regrowth_delayed.ts             # dry
//   APPLY=1 npx tsx scripts/_msg_regrowth_delayed.ts     # send

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT||"","base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");

const TEAM_FROM_ID = "0";

// Aadi excluded these emails (Moetez — likely duplicate/test accounts).
const EXCLUDE_EMAILS = new Set([
  "yesxyz@gmail.com",
  "tryme32@gmail.com",
  "moetez1@gmail.com",
  "test14@test.com",
]);

// Stripe payers whose Firestore regrowth_treatment_purchased flag wasn't set
// by the webhook — add them manually so they still get the customs-delay
// message like the other paid customers.
const INCLUDE_EMAILS_MANUAL = [
  "lharefrazee@swbell.net",
  "karineavi@gmail.com",
];

function buildMessage(firstName: string): string {
  const name = firstName?.trim() || "there";
  return `Hey ${name} — quick update on your regrowth kit. Our next batch got held up at customs and should clear soon. You'll receive a tracking link and confirmation email before yours ships. Sorry for the wait, really appreciate your patience.`;
}

(async () => {
  console.log(`\n=== Regrowth-delayed bulk message — ${APPLY ? "APPLY (writing!)" : "DRY RUN"} ===\n`);

  console.log(`Querying Users where regrowth_treatment_purchased == true…`);
  const snap = await db.collection("Users").where("regrowth_treatment_purchased","==",true).get();
  console.log(`  fetched ${snap.size} purchased-kit docs.\n`);

  const eligible: { uid: string; email: string; firstName: string; treatmentStage: string; purchasedAt: string }[] = [];
  let activatedAlready = 0;
  let deleted = 0;
  let excluded = 0;

  for (const d of snap.docs) {
    const x:any = d.data();
    if (x.is_deleted) { deleted++; continue; }
    if (x.treatment_stage === "REGROWTH") { activatedAlready++; continue; }
    if (EXCLUDE_EMAILS.has((x.email||"").toLowerCase())) { excluded++; continue; }
    eligible.push({
      uid: d.id,
      email: x.email || "?",
      firstName: x.first_name || x.wp_user?.display_name?.split(" ")[0] || "",
      treatmentStage: x.treatment_stage || "(none)",
      purchasedAt: x.regrowth_kit_paid_at?.toDate?.()?.toISOString().slice(0,10) || "?",
    });
  }

  // Pull in manually-included emails (Stripe payers whose webhook flag wasn't set)
  let manuallyAdded = 0;
  for (const email of INCLUDE_EMAILS_MANUAL) {
    const q = await db.collection("Users").where("email","==",email).limit(1).get();
    if (q.empty) { console.log(`  ⚠ manual include ${email} — not found in Firestore, skipping`); continue; }
    const d = q.docs[0];
    const x:any = d.data();
    if (x.is_deleted) continue;
    if (eligible.some(e => e.uid === d.id)) continue;  // already in list
    eligible.push({
      uid: d.id,
      email: x.email,
      firstName: x.first_name || x.wp_user?.display_name?.split(" ")[0] || "",
      treatmentStage: x.treatment_stage || "(none)",
      purchasedAt: x.regrowth_kit_paid_at?.toDate?.()?.toISOString().slice(0,10) || "?",
    });
    manuallyAdded++;
  }

  console.log(`Eligible (purchased + not activated):  ${eligible.length - manuallyAdded}`);
  console.log(`Manually added (webhook-missed):        ${manuallyAdded}`);
  console.log(`Total eligible:                         ${eligible.length}`);
  console.log(`Skipped (already activated REGROWTH):   ${activatedAlready}`);
  console.log(`Skipped (is_deleted):                   ${deleted}`);
  console.log(`Skipped (excluded by name):             ${excluded}\n`);

  // Sort by purchasedAt descending so most-recent buyers are first (most likely to be waiting)
  eligible.sort((a,b) => b.purchasedAt.localeCompare(a.purchasedAt));

  console.log(`First 10 by purchase date (newest first):`);
  console.log(`  ${"purchased".padEnd(11)} ${"stage".padEnd(20)} ${"name".padEnd(18)} email`);
  for (const u of eligible.slice(0, 10)) {
    console.log(`  ${u.purchasedAt.padEnd(11)} ${u.treatmentStage.padEnd(20)} ${(u.firstName||"-").padEnd(18)} ${u.email}`);
  }

  // Stage breakdown so Aadi can sanity-check segments
  const byStage: Record<string, number> = {};
  for (const u of eligible) byStage[u.treatmentStage] = (byStage[u.treatmentStage]||0)+1;
  console.log(`\nBy treatment_stage:`);
  for (const [k,v] of Object.entries(byStage).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${k.padEnd(25)} ${v}`);
  }

  console.log(`\nMessage preview (for "Alex"):\n`);
  console.log(`  "${buildMessage("Alex")}"`);

  if (!APPLY) {
    console.log(`\nDRY RUN — re-run with APPLY=1 to actually send.\n`);
    process.exit(0);
  }

  console.log(`\nWriting messages to support/{uid}/messages…`);
  let ok = 0, fail = 0;
  const failures: any[] = [];
  for (let i = 0; i < eligible.length; i++) {
    const u = eligible[i];
    try {
      await db.collection("support").doc(u.uid).collection("messages").add({
        fromId: TEAM_FROM_ID,
        content: buildMessage(u.firstName),
        attachments: null,
        feedback: null,
        type: "direct",
        timestamp: Timestamp.now(),
      });
      ok++;
    } catch (e:any) {
      fail++;
      failures.push({ uid: u.uid, email: u.email, error: e.message });
    }
    if (i > 0 && i % 25 === 0) console.log(`  …${i}/${eligible.length}  ok=${ok} fail=${fail}`);
  }
  console.log(`\nDone. ok=${ok} fail=${fail}`);
  if (failures.length) {
    console.log(`\nFirst 5 failures:`);
    failures.slice(0,5).forEach(f => console.log(`  ${f.email}: ${f.error}`));
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
