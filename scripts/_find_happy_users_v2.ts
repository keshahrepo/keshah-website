// v2 — tighter regex: require past-tense/reporting language, reject questions and complaints.
// Broader positive vocabulary. Shows the raw message + context.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// POSITIVE — a real testimonial signal (must be a REPORT, not a question)
const POSITIVE: [RegExp, number, string][] = [
  // Direct praise + result
  [/\b(really appreciate|thanks to (you|keshah|aadi|the team)|thank you so much|forever grateful|so grateful|life[\s-]?chang(ing|er))\b/i, 4, "gratitude"],
  [/\b(helped me|helping me|keshah (has |really )?(helped|worked|changed))\b/i, 4, "helped me"],

  // Reported results (past/present tense reports)
  [/\b((i've|i have|have) (seen|noticed|felt|experienced))\b/i, 4, "past-tense report"],
  [/\b((i'm|i am) (seeing|noticing|feeling|experiencing))\b/i, 4, "present report"],
  [/\b(started (seeing|noticing|feeling)|starting to see|began (seeing|noticing))\b/i, 4, "started seeing"],
  [/\b(after (\d+ (day|week|month)s?|a (week|month|year))|at (day|week) \d+ i)\b/i, 3, "time-based"],

  // Specific improvements
  [/\b(shedding (has |is )?(reduced|cut|down|less|halved|halved|stopped))\b/i, 5, "shedding reduced"],
  [/\b(less(er)? (shedding|hair loss|hair fall)|shedding is less|no more shedding|shedding stopped)\b/i, 5, "less shedding"],
  [/\b(hair(\s+is)?\s+growing back|new hairs? are growing|regrown|regrew|new hair growth (in|on) my)\b/i, 5, "growing back"],
  [/\b((hair|it) (is|has been|has gotten|feels|looks) (thicker|denser|fuller|healthier|stronger))\b/i, 5, "thicker"],
  [/\b(volume of (my |the )?hair (has )?improved|hair (has )?improved (a lot|significantly|noticeably))\b/i, 5, "hair improved"],
  [/\b(cut in half|halved|significant improvement|noticeable difference|real (results|difference))\b/i, 4, "significant"],

  // Mechanism working (Aadi's testable signals — reported, not asked)
  [/\b(scalp (is|feels|got|has gotten) (loose|looser|more flexible|less tight)|feel my scalp (is |a bit )?loose)\b/i, 4, "loose scalp reported"],
  [/\b(can now (pinch|slide|move) (my )?scalp|able to pinch|scalp mobility (has )?improved)\b/i, 4, "mobility improved"],

  // Aspirational + emotional
  [/\b(loving (this|it|keshah)|love (this|it|keshah)|absolutely love|amazing (results|change))\b/i, 3, "loving"],
  [/\b(want(ed)? to thank|writing to (thank|say)|had to (share|tell you)|felt like sharing)\b/i, 3, "wanting to share"],

  // Willingness to share/testimonial
  [/\b(happy to (provide|share)|willing to (share|post|testify)|written statement|do a testimonial|record a video|share my (story|experience))\b/i, 5, "will share"],
];

// NEGATIVE — kill signals — if any of these match, DROP the user
const NEGATIVE: RegExp[] = [
  // Interrogatives — this is a question, not a report
  /\?\s*$/,                                  // ends with ?
  /\b(when (will|can|do|should|shall) i)\b/i,
  /\b(will (i|it|this) (start|help|work|see))\b/i,
  /\b(how (long|often|much|many) (until|before|does|do))\b/i,
  /\b(can (you|i) (help|explain|tell|confirm))\b/i,
  /\b(does (this|it|the routine) (help|work|stop))\b/i,
  /\b(is it (possible|normal|okay|ok) (that|to|for))\b/i,
  // Complaints / no-result reports
  /\b(no (change|results|difference|improvement|growth|effect)|nothing (has )?changed|not (seeing|noticing) (any|much|a) )/i,
  /\b(still (no|the same|losing|shedding|balding|declining)|haven't (seen|noticed|felt))\b/i,
  /\b(worse|worsen|worsened|getting worse|declining|falling more|more (shedding|hair loss|hair fall))\b/i,
  /\b(scam|refund|cancel|unsubscribe|money back|waste of time)\b/i,
];

(async () => {
  console.log("▸ Fetching all support messages…\n");
  const allMsgs = await db.collectionGroup("messages").get();
  console.log(`  ${allMsgs.size} messages\n`);

  type Hit = { uid: string; msg: string; score: number; matched: string[]; ts: number };
  const byUid = new Map<string, Hit>();

  for (const doc of allMsgs.docs) {
    const m = doc.data() as any;
    if (m.fromId === "0") continue;
    if (typeof m.content !== "string" || m.content.length < 15) continue;

    // Reject if any negative pattern hits
    if (NEGATIVE.some(re => re.test(m.content))) continue;

    let score = 0;
    const matched: string[] = [];
    for (const [re, w, tag] of POSITIVE) {
      if (re.test(m.content)) { score += w; matched.push(tag); }
    }
    if (score < 4) continue;  // require at least one solid signal

    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    const existing = byUid.get(uid);
    if (!existing || score > existing.score) {
      byUid.set(uid, { uid, msg: m.content, score, matched, ts: m.timestamp?.toMillis?.() ?? 0 });
    }
  }

  const ranked = Array.from(byUid.values()).sort((a, b) => b.score - a.score);
  console.log(`▸ ${ranked.length} REAL positive-testimonial users (filtered)\n`);
  console.log("═".repeat(100));

  const uids = ranked.map(h => h.uid);
  const userDocs = await Promise.all(uids.map(uid => db.collection("Users").doc(uid).get()));

  for (let i = 0; i < ranked.length; i++) {
    const h = ranked[i];
    const u = userDocs[i].data() as any;
    const name = u?.name ?? u?.first_name ?? "(no name)";
    const email = u?.email ?? "(no email)";
    const stage = u?.treatment_stage ?? "?";
    const pn = u?.phone_number;
    const phone = pn && typeof pn === "object" ? pn.complete_number : (pn ?? "(no phone)");
    const country = pn?.country_code ?? "?";

    console.log(`\n#${i+1}  score=${h.score}  [${h.matched.join(", ")}]`);
    console.log(`  👤 ${name}  (${stage})  ${country}`);
    console.log(`     ${email}   ${phone}`);
    const short = h.msg.replace(/\s+/g, " ").trim().slice(0, 350);
    console.log(`     💬 "${short}"`);
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
