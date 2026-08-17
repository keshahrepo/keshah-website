// Find users who have said KESHAH is helping — for outreach (post experience,
// testimonials, Reddit, etc). Scans support messages FROM users (not Aadi),
// scores each by positive-result keywords, ranks best candidates.
//
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_find_happy_users.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// Weighted keywords — higher = stronger signal of "keshah helped me"
const POSITIVE_PATTERNS: [RegExp, number, string][] = [
  // Strong result claims (weight 5)
  [/\b(hair(\s+is)?\s+growing back)\b/i, 5, "growing back"],
  [/\b(regrowth is|seeing regrowth|got regrowth|new hair growth)\b/i, 5, "regrowth"],
  [/\b(no more shedding|shedding (has )?stopped|stopped shedding)\b/i, 5, "shed stopped"],
  [/\b(4 months of real results|months? of real results)\b/i, 5, "months of results"],
  [/\b(life[\s-]?chang(ing|er))\b/i, 5, "life-changing"],

  // Clear positive results (weight 4)
  [/\b(seeing results|see(ing)? a? difference|noticed? a? difference|noticing.{0,20}(change|improvement|difference))\b/i, 4, "seeing results"],
  [/\b(less(er)? shedding|reduced shedding|shedding (is )?(less|reduced|down))\b/i, 4, "less shedding"],
  [/\b(thicker (hair|now)|hair(\s+is)? thicker|denser|fuller hair)\b/i, 4, "thicker hair"],
  [/\b(hair(\s+has)? improved|improvement in hair)\b/i, 4, "hair improved"],

  // Mechanism working — Aadi's testable signals (weight 4)
  [/\b(scalp (is|feels|got|got a bit) (loose|looser|more flexible|less tight))\b/i, 4, "loose scalp"],
  [/\b(feel.{0,10}scalp.{0,10}loose)\b/i, 4, "feel scalp loose"],

  // Gratitude + result (weight 3)
  [/\b(helped me|helping me|thanks to (you|keshah|aadi)|working for me)\b/i, 3, "helped me"],
  [/\b(really appreciate|so grateful|forever grateful)\b/i, 3, "grateful"],
  [/\b(keshah (has |really )?(helped|worked|changed|saved))\b/i, 3, "keshah has helped"],

  // Softer positive (weight 2)
  [/\b(loving|love this|amazing|awesome results)\b/i, 2, "loving it"],
  [/\b(feel(s|ing) (great|better|different) about my hair)\b/i, 2, "feels great"],
];

(async () => {
  console.log("▸ Fetching all support messages via collectionGroup…\n");
  const allMsgs = await db.collectionGroup("messages").get();
  console.log(`  ${allMsgs.size} messages\n`);

  // Score user messages only (fromId != "0")
  type Hit = { uid: string; msg: string; ts: number; score: number; matched: string[] };
  const hitsByUid = new Map<string, Hit>();

  for (const doc of allMsgs.docs) {
    const m = doc.data() as any;
    if (m.fromId === "0") continue;  // skip Aadi's messages
    if (typeof m.content !== "string" || m.content.length < 10) continue;
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;

    let score = 0;
    const matched: string[] = [];
    for (const [re, w, tag] of POSITIVE_PATTERNS) {
      if (re.test(m.content)) { score += w; matched.push(tag); }
    }
    if (score === 0) continue;

    const existing = hitsByUid.get(uid);
    if (!existing || score > existing.score) {
      hitsByUid.set(uid, {
        uid,
        msg: m.content,
        ts: m.timestamp?.toMillis?.() ?? 0,
        score,
        matched,
      });
    }
  }

  const ranked = Array.from(hitsByUid.values()).sort((a, b) => b.score - a.score);
  console.log(`▸ ${ranked.length} users with positive-result messages\n`);
  console.log(`Showing top 30 by score…\n`);
  console.log("═".repeat(100));

  const top = ranked.slice(0, 30);
  const uids = top.map(h => h.uid);
  // Batch fetch user records
  const userDocs = await Promise.all(uids.map(uid => db.collection("Users").doc(uid).get()));

  for (let i = 0; i < top.length; i++) {
    const h = top[i];
    const u = userDocs[i].data() as any;
    const name = u?.name ?? u?.first_name ?? "(no name)";
    const email = u?.email ?? "(no email)";
    const stage = u?.treatment_stage ?? "?";
    const pn = u?.phone_number;
    const phone = pn && typeof pn === "object" ? pn.complete_number : (pn ?? "(no phone)");
    const country = pn?.country_code ?? "?";

    console.log(`\n#${i+1}  score=${h.score}  matched=[${h.matched.join(", ")}]`);
    console.log(`  👤 ${name}  (${stage})`);
    console.log(`     ${email}`);
    console.log(`     ${phone}  (${country})`);
    const short = h.msg.replace(/\s+/g, " ").trim().slice(0, 300);
    console.log(`     💬 "${short}"`);
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
