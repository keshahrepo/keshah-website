// Second-pass audit for hair-loss-stoppage self-reports.
// Focus: root collections FeelCheckAnswers + ProgressCheckAnswers
// (each doc = one weekly survey submission from one user).
//
// Also verifies:
//  - Users/{id}/FeelCheck subcollection (per CLAUDE.md = memory videos)
//  - Additional user-doc fields: hair_loss_reduced_reported_once,
//    hair_loss_stoppage_reported_once, weekly_feel_check_answers, etc.
//
// Run:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_hair_loss_stopped_claim_v2.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const pct = (n: number, d: number) => (d === 0 ? "n/a" : ((n / d) * 100).toFixed(1) + "%");

// Question banks copied verbatim from lib/screens/weekly_feel_check/*.dart
const FEEL_QUESTIONS = [
  "I have noticed increased levels of shedding.",
  "My scalp feels less tense and the skin is more flexible.",
  "My scalp feels healthier.",
  "I have noticed a reduction in hair fall.",
  "My hair fall has stopped.",
  "My hair feels thicker and stronger.",
  "I have noticed signs of hair regrowth.",
];
// FeelCheckAnswers: 3 choices — 0 Yes, 1 I believe so, 2 Not Yet
// ProgressCheckAnswers: 2 choices — 0 Yes, 1 Not Yet

type ChoiceKey = "yes" | "believe_so" | "not_yet" | "other";
type Tally = Record<ChoiceKey, number>;
const mkTally = (): Tally => ({ yes: 0, believe_so: 0, not_yet: 0, other: 0 });

function bucketFeel(v: any): ChoiceKey {
  if (v === 0 || v === "0") return "yes";
  if (v === 1 || v === "1") return "believe_so";
  if (v === 2 || v === "2") return "not_yet";
  return "other";
}
function bucketProgress(v: any): ChoiceKey {
  if (v === 0 || v === "0") return "yes";
  if (v === 1 || v === "1") return "not_yet";
  return "other";
}

(async () => {
  // ---------- Step 1. Fetch paying-user set for cross-reference ----------
  console.log("Loading paying-user set from Users (converted_at present, not deleted)...");
  const usersSnap = await db.collection("Users").get();
  const payingIds = new Set<string>();
  const allUserIds = new Set<string>();
  let totalNonDeleted = 0;
  // Also track user-doc-level fields the first agent may have missed
  let hasLossReducedOnce = 0, hasLossStoppageOnce = 0, hasFeelCheckField = 0, hasProgressCheckField = 0;
  let payingLossStoppageOnce = 0, payingLossReducedOnce = 0;
  for (const d of usersSnap.docs) {
    const x = d.data();
    if (x.is_deleted) continue;
    totalNonDeleted++;
    allUserIds.add(d.id);
    const paying = !!x.converted_at;
    if (paying) payingIds.add(d.id);
    if (x.hair_loss_reduced_reported_once === true) {
      hasLossReducedOnce++;
      if (paying) payingLossReducedOnce++;
    }
    if (x.hair_loss_stoppage_reported_once === true) {
      hasLossStoppageOnce++;
      if (paying) payingLossStoppageOnce++;
    }
    if (x.weekly_feel_check_answers) hasFeelCheckField++;
    if (x.progress_check_answers) hasProgressCheckField++;
  }
  console.log(`  non-deleted users:      ${totalNonDeleted}`);
  console.log(`  paying (converted_at):  ${payingIds.size}`);
  console.log("");

  console.log("USER-DOC FIELDS (across ALL users):");
  console.log(`  hair_loss_reduced_reported_once == true : ${hasLossReducedOnce}  (paying: ${payingLossReducedOnce})`);
  console.log(`  hair_loss_stoppage_reported_once == true: ${hasLossStoppageOnce} (paying: ${payingLossStoppageOnce})`);
  console.log(`  weekly_feel_check_answers field present : ${hasFeelCheckField}`);
  console.log(`  progress_check_answers field present    : ${hasProgressCheckField}`);
  console.log("");

  // ---------- Step 2. List subcollections on a few user docs ----------
  console.log("SUBCOLLECTIONS on 3 sample user docs:");
  const sampleUsers = usersSnap.docs.slice(0, 3);
  for (const u of sampleUsers) {
    const cols = await u.ref.listCollections();
    console.log(`  User ${u.id}: [${cols.map(c => c.id).join(", ") || "(none)"}]`);
  }
  console.log("");

  // ---------- Step 3. FeelCheckAnswers root collection ----------
  console.log("=".repeat(60));
  console.log("FeelCheckAnswers (old 7-question weekly feel check, 3 choices)");
  console.log("=".repeat(60));
  const feelSnap = await db.collection("FeelCheckAnswers").get();
  console.log(`Total docs: ${feelSnap.size}`);
  const feelUserIds = new Set<string>();
  const feelPayingUserIds = new Set<string>();
  const feelTallies: Tally[] = FEEL_QUESTIONS.map(() => mkTally());
  const feelTalliesPaying: Tally[] = FEEL_QUESTIONS.map(() => mkTally());
  let feelSampleDumped = false;
  for (const doc of feelSnap.docs) {
    const x = doc.data();
    if (!feelSampleDumped) {
      console.log("\nSAMPLE FeelCheckAnswers doc:");
      console.log(JSON.stringify(x, null, 2).slice(0, 1600));
      console.log("");
      feelSampleDumped = true;
    }
    const uid = x?.userDetailBasic?.userId ?? x?.user_id ?? null;
    const isPaying = uid && payingIds.has(uid);
    if (uid) feelUserIds.add(uid);
    if (isPaying) feelPayingUserIds.add(uid);
    const answers = x?.answers ?? {};
    for (let i = 0; i < FEEL_QUESTIONS.length; i++) {
      const key = String(i);
      if (answers[key] === undefined && answers[i] === undefined) continue;
      const v = answers[key] ?? answers[i];
      const b = bucketFeel(v);
      feelTallies[i][b]++;
      if (isPaying) feelTalliesPaying[i][b]++;
    }
  }
  console.log(`Unique users who submitted:  ${feelUserIds.size}`);
  console.log(`Unique PAYING users:         ${feelPayingUserIds.size}`);
  console.log("\nAnswer breakdown per question (all submissions, ALL users):");
  for (let i = 0; i < FEEL_QUESTIONS.length; i++) {
    const t = feelTallies[i];
    const n = t.yes + t.believe_so + t.not_yet + t.other;
    console.log(`  Q${i} "${FEEL_QUESTIONS[i]}"  n=${n}`);
    console.log(`      yes=${t.yes} (${pct(t.yes, n)})  believe_so=${t.believe_so} (${pct(t.believe_so, n)})  not_yet=${t.not_yet} (${pct(t.not_yet, n)})  other=${t.other}`);
  }
  console.log("\nAnswer breakdown per question (PAYING users only):");
  for (let i = 0; i < FEEL_QUESTIONS.length; i++) {
    const t = feelTalliesPaying[i];
    const n = t.yes + t.believe_so + t.not_yet + t.other;
    console.log(`  Q${i} "${FEEL_QUESTIONS[i]}"  n=${n}`);
    console.log(`      yes=${t.yes} (${pct(t.yes, n)})  believe_so=${t.believe_so} (${pct(t.believe_so, n)})  not_yet=${t.not_yet} (${pct(t.not_yet, n)})  other=${t.other}`);
  }

  // ---------- Step 4. ProgressCheckAnswers root collection ----------
  console.log("\n" + "=".repeat(60));
  console.log("ProgressCheckAnswers (newer 7-question progress check, 2 choices)");
  console.log("=".repeat(60));
  const progSnap = await db.collection("ProgressCheckAnswers").get();
  console.log(`Total docs: ${progSnap.size}`);
  const progUserIds = new Set<string>();
  const progPayingUserIds = new Set<string>();
  const progTallies: Tally[] = FEEL_QUESTIONS.map(() => mkTally());
  const progTalliesPaying: Tally[] = FEEL_QUESTIONS.map(() => mkTally());
  // Per-user "ever answered YES" tallies (dedup users, use their last-known answer)
  const progUsersEverYesQ4 = new Set<string>(); // hair fall stopped
  const progUsersEverYesQ3 = new Set<string>(); // hair fall reduced
  const progUsersEverAnsweredQ4 = new Set<string>();
  let progSampleDumped = false;
  for (const doc of progSnap.docs) {
    const x = doc.data();
    if (!progSampleDumped) {
      console.log("\nSAMPLE ProgressCheckAnswers doc:");
      console.log(JSON.stringify(x, null, 2).slice(0, 1600));
      console.log("");
      progSampleDumped = true;
    }
    const uid = x?.userDetailBasic?.userId ?? x?.user_id ?? null;
    const isPaying = uid && payingIds.has(uid);
    if (uid) progUserIds.add(uid);
    if (isPaying) progPayingUserIds.add(uid);
    const answers = x?.answers ?? {};
    for (let i = 0; i < FEEL_QUESTIONS.length; i++) {
      const key = String(i);
      if (answers[key] === undefined && answers[i] === undefined) continue;
      const v = answers[key] ?? answers[i];
      const b = bucketProgress(v);
      progTallies[i][b]++;
      if (isPaying) progTalliesPaying[i][b]++;
      if (uid && i === 4) {
        progUsersEverAnsweredQ4.add(uid);
        if (b === "yes") progUsersEverYesQ4.add(uid);
      }
      if (uid && i === 3 && b === "yes") progUsersEverYesQ3.add(uid);
    }
  }
  console.log(`Unique users who submitted:  ${progUserIds.size}`);
  console.log(`Unique PAYING users:         ${progPayingUserIds.size}`);
  console.log("\nAnswer breakdown per question (all submissions, ALL users):");
  for (let i = 0; i < FEEL_QUESTIONS.length; i++) {
    const t = progTallies[i];
    const n = t.yes + t.not_yet + t.other;
    console.log(`  Q${i} "${FEEL_QUESTIONS[i]}"  n=${n}`);
    console.log(`      yes=${t.yes} (${pct(t.yes, n)})  not_yet=${t.not_yet} (${pct(t.not_yet, n)})  other=${t.other}`);
  }
  console.log("\nAnswer breakdown per question (PAYING users only):");
  for (let i = 0; i < FEEL_QUESTIONS.length; i++) {
    const t = progTalliesPaying[i];
    const n = t.yes + t.not_yet + t.other;
    console.log(`  Q${i} "${FEEL_QUESTIONS[i]}"  n=${n}`);
    console.log(`      yes=${t.yes} (${pct(t.yes, n)})  not_yet=${t.not_yet} (${pct(t.not_yet, n)})  other=${t.other}`);
  }
  console.log("\nPer-USER dedup (any submission ever answered YES on Q4 = hair fall stopped):");
  console.log(`  Users who ever answered Q4:        ${progUsersEverAnsweredQ4.size}`);
  console.log(`  Users who ever said 'Yes' on Q4:   ${progUsersEverYesQ4.size} (${pct(progUsersEverYesQ4.size, progUsersEverAnsweredQ4.size)} of answerers)`);
  const payingEverYesQ4 = [...progUsersEverYesQ4].filter(id => payingIds.has(id)).length;
  const payingEverAnsweredQ4 = [...progUsersEverAnsweredQ4].filter(id => payingIds.has(id)).length;
  console.log(`  Paying users who ever answered Q4: ${payingEverAnsweredQ4}`);
  console.log(`  Paying users who ever said 'Yes':  ${payingEverYesQ4} (${pct(payingEverYesQ4, payingEverAnsweredQ4)} of paying answerers)`);
  console.log(`  Users who ever said 'Yes' on Q3 (reduction): ${progUsersEverYesQ3.size}`);

  // ---------- Step 5. Users/{id}/FeelCheck subcollection sanity check ----------
  console.log("\n" + "=".repeat(60));
  console.log("Users/{id}/FeelCheck subcollection sanity check (per CLAUDE.md = memory videos)");
  console.log("=".repeat(60));
  let subUsersScanned = 0;
  let subDocsFound = 0;
  let subSampleDumped = false;
  // Only scan a slice to avoid N=~thousands of subcollection reads
  const scanSlice = usersSnap.docs.slice(0, 400);
  for (const u of scanSlice) {
    subUsersScanned++;
    const fs = await u.ref.collection("FeelCheck").limit(2).get();
    if (fs.size > 0) {
      subDocsFound += fs.size;
      if (!subSampleDumped) {
        console.log(`Sample doc from Users/${u.id}/FeelCheck:`);
        console.log(JSON.stringify(fs.docs[0].data(), null, 2).slice(0, 1200));
        console.log("");
        subSampleDumped = true;
      }
    }
  }
  console.log(`  Scanned ${subUsersScanned} users, found ${subDocsFound} FeelCheck docs (limit 2 per user).`);

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); console.error(e.stack); process.exit(1); });
