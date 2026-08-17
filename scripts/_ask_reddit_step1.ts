// Ask happy users if they're on Reddit. Step 1 of a 2-step outreach — if they say
// yes, Aadi follows up personally via SMS with the actual review ask.
//
// - Re-scans support messages to find happy users (same logic as _find_happy_users_v2.ts)
// - Filters out anyone already asked (tracked in reddit_ask_manifest.json)
// - Filters out anyone who already mentioned reddit (to avoid double-asking)
// - Sorts: REGROWTH first → has phone → testimonial score
// - Sends "Hey {name} - quick q - do you happen to be a reddit user?" via support chat
// - Appends UID to manifest so future runs skip them
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_ask_reddit_step1.ts               # dry-run, shows top 8
//   npx tsx scripts/_ask_reddit_step1.ts --count 10    # dry-run, shows top 10
//   npx tsx scripts/_ask_reddit_step1.ts --apply       # SEND to top 8

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as fs from "fs";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const APPLY = process.argv.includes("--apply");
const countArg = process.argv.find(a => a.startsWith("--count="));
const COUNT = countArg ? parseInt(countArg.split("=")[1]) : 8;
const MANIFEST_PATH = "reddit_ask_manifest.json";

// Same positive/negative regex as _find_happy_users_v2.ts (kept in sync manually)
const POSITIVE: [RegExp, number][] = [
  [/\b(really appreciate|thanks to (you|keshah|aadi|the team)|thank you so much|forever grateful|so grateful|life[\s-]?chang(ing|er))\b/i, 4],
  [/\b(helped me|helping me|keshah (has |really )?(helped|worked|changed))\b/i, 4],
  [/\b((i've|i have|have) (seen|noticed|felt|experienced))\b/i, 4],
  [/\b((i'm|i am) (seeing|noticing|feeling|experiencing))\b/i, 4],
  [/\b(started (seeing|noticing|feeling)|starting to see|began (seeing|noticing))\b/i, 4],
  [/\b(after (\d+ (day|week|month)s?|a (week|month|year))|at (day|week) \d+ i)\b/i, 3],
  [/\b(shedding (has |is )?(reduced|cut|down|less|halved|halved|stopped))\b/i, 5],
  [/\b(less(er)? (shedding|hair loss|hair fall)|shedding is less|no more shedding|shedding stopped)\b/i, 5],
  [/\b(hair(\s+is)?\s+growing back|new hairs? are growing|regrown|regrew|new hair growth (in|on) my)\b/i, 5],
  [/\b((hair|it) (is|has been|has gotten|feels|looks) (thicker|denser|fuller|healthier|stronger))\b/i, 5],
  [/\b(volume of (my |the )?hair (has )?improved|hair (has )?improved (a lot|significantly|noticeably))\b/i, 5],
  [/\b(cut in half|halved|significant improvement|noticeable difference|real (results|difference))\b/i, 4],
  [/\b(scalp (is|feels|got|has gotten) (loose|looser|more flexible|less tight)|feel my scalp (is |a bit )?loose)\b/i, 4],
  [/\b(can now (pinch|slide|move) (my )?scalp|able to pinch|scalp mobility (has )?improved)\b/i, 4],
  [/\b(loving (this|it|keshah)|love (this|it|keshah)|absolutely love|amazing (results|change))\b/i, 3],
  [/\b(want(ed)? to thank|writing to (thank|say)|had to (share|tell you)|felt like sharing)\b/i, 3],
  [/\b(happy to (provide|share)|willing to (share|post|testify)|written statement|do a testimonial|record a video|share my (story|experience))\b/i, 5],
];
const NEGATIVE: RegExp[] = [
  /\?\s*$/,
  /\b(when (will|can|do|should|shall) i)\b/i,
  /\b(will (i|it|this) (start|help|work|see))\b/i,
  /\b(how (long|often|much|many) (until|before|does|do))\b/i,
  /\b(can (you|i) (help|explain|tell|confirm))\b/i,
  /\b(does (this|it|the routine) (help|work|stop))\b/i,
  /\b(is it (possible|normal|okay|ok) (that|to|for))\b/i,
  /\b(no (change|results|difference|improvement|growth|effect)|nothing (has )?changed|not (seeing|noticing) (any|much|a) )/i,
  /\b(still (no|the same|losing|shedding|balding|declining)|haven't (seen|noticed|felt))\b/i,
  /\b(worse|worsen|worsened|getting worse|declining|falling more|more (shedding|hair loss|hair fall))\b/i,
  /\b(scam|refund|cancel|unsubscribe|money back|waste of time)\b/i,
];

type Candidate = {
  uid: string; name: string; email: string; stage: string;
  phone: string; hasPhone: boolean; score: number; quote: string;
};

function loadManifest(): { asked: string[]; last_run?: string } {
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")); }
  catch { return { asked: [] }; }
}
function saveManifest(m: any) { fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2)); }

(async () => {
  console.log("▸ Scanning for happy users…");
  const allMsgs = await db.collectionGroup("messages").get();
  console.log(`  ${allMsgs.size} messages fetched`);

  // Score each user + note whether they've ever mentioned reddit
  const scoreByUid = new Map<string, { score: number; quote: string }>();
  const alreadyMentionedReddit = new Set<string>();

  for (const doc of allMsgs.docs) {
    const m = doc.data() as any;
    const uid = doc.ref.parent.parent?.id;
    if (!uid || typeof m.content !== "string") continue;
    if (/reddit/i.test(m.content)) alreadyMentionedReddit.add(uid);
    if (m.fromId === "0") continue;
    if (m.content.length < 15) continue;
    if (NEGATIVE.some(re => re.test(m.content))) continue;
    let score = 0;
    for (const [re, w] of POSITIVE) if (re.test(m.content)) score += w;
    if (score < 4) continue;
    const existing = scoreByUid.get(uid);
    if (!existing || score > existing.score) scoreByUid.set(uid, { score, quote: m.content });
  }

  const manifest = loadManifest();
  const asked = new Set(manifest.asked ?? []);
  console.log(`  Manifest: ${asked.size} users already asked`);
  console.log(`  Already mentioned reddit (skip): ${alreadyMentionedReddit.size}`);

  // Fetch user records for candidates
  const uids = Array.from(scoreByUid.keys()).filter(u => !asked.has(u) && !alreadyMentionedReddit.has(u));
  const userDocs = await Promise.all(uids.map(u => db.collection("Users").doc(u).get()));

  const candidates: Candidate[] = [];
  for (let i = 0; i < uids.length; i++) {
    const u = userDocs[i].data() as any;
    if (!u) continue;
    const pn = u.phone_number;
    const phone = pn && typeof pn === "object" ? pn.complete_number : (typeof pn === "string" ? pn : "");
    candidates.push({
      uid: uids[i],
      name: u.name ?? u.first_name ?? "",
      email: u.email ?? "",
      stage: u.treatment_stage ?? "?",
      phone: phone || "(no phone)",
      hasPhone: !!phone,
      score: scoreByUid.get(uids[i])!.score,
      quote: scoreByUid.get(uids[i])!.quote,
    });
  }

  // Sort: REGROWTH first → has phone → score
  candidates.sort((a, b) => {
    const sr = (b.stage === "REGROWTH" ? 1 : 0) - (a.stage === "REGROWTH" ? 1 : 0);
    if (sr) return sr;
    const sp = (b.hasPhone ? 1 : 0) - (a.hasPhone ? 1 : 0);
    if (sp) return sp;
    return b.score - a.score;
  });

  const picks = candidates.slice(0, COUNT);
  console.log(`\n▸ Top ${picks.length} to ask (${candidates.length} total eligible):\n`);
  console.log("─".repeat(100));
  for (const c of picks) {
    console.log(`  ${c.stage.padEnd(15)} ${c.email.padEnd(40)} ${c.phone.padEnd(18)} score=${c.score}`);
    console.log(`     name: "${c.name}" — quote: "${c.quote.replace(/\s+/g," ").trim().slice(0,120)}"`);
  }

  if (!APPLY) {
    console.log(`\n(dry-run — pass --apply to send in-app messages)`);
    process.exit(0);
  }

  console.log(`\n▸ Sending in-app messages…`);
  for (const c of picks) {
    const nameForMsg = c.name ? ` ${c.name.trim().split(/\s+/)[0]}` : "";
    const content = `Hey${nameForMsg} - Aadi here - quick q - do you happen to be a reddit user?`;
    await db.collection("support").doc(c.uid).collection("messages").add({
      fromId: "0",
      content,
      attachments: null,
      feedback: null,
      type: "direct",
      timestamp: Timestamp.now(),
    });
    console.log(`  ✓ sent to ${c.email}`);
    asked.add(c.uid);
  }
  manifest.asked = Array.from(asked);
  manifest.last_run = new Date().toISOString();
  saveManifest(manifest);
  console.log(`\n✓ Manifest updated (${asked.size} total asked)`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
