// Find users who mentioned "reddit" in support chat and their contact info.
// Iterates every support conversation, looks for messages containing "reddit"
// (either from Aadi asking or user replying), and dumps context + phone.
//
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_find_reddit_users.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const PHONE_FIELDS = ["phone", "phone_number", "phoneNumber", "mobile", "contact", "customer_contact"];

(async () => {
  console.log("▸ Using collectionGroup query to search ALL messages at once…\n");

  // Collection-group query: pulls every "messages" doc across every support conversation
  // in ONE server-side operation. Much faster than iterating conversation-by-conversation.
  // Firestore can't substring-match server-side, so we filter locally.
  const allMsgs = await db.collectionGroup("messages").get();
  console.log(`  ${allMsgs.size} total messages fetched\n`);

  // Bucket matching messages by parent conversation UID
  const hitsByUid = new Map<string, any[]>();
  for (const doc of allMsgs.docs) {
    const m = doc.data() as any;
    if (typeof m.content !== "string" || !/reddit/i.test(m.content)) continue;
    // parent = messages collection, parent.parent = support/{UID} doc
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    if (!hitsByUid.has(uid)) hitsByUid.set(uid, []);
    hitsByUid.get(uid)!.push({ ...m, _ts: m.timestamp?.toMillis?.() ?? 0 });
  }

  console.log(`  ${hitsByUid.size} conversations mention 'reddit'\n`);

  // For each matched conversation, fetch full thread for context
  type Match = { uid: string; matchAt: number; conv: any[] };
  const matches: Match[] = [];
  const uidList = Array.from(hitsByUid.keys());
  const BATCH = 20;
  for (let i = 0; i < uidList.length; i += BATCH) {
    const batch = uidList.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async uid => {
      const snap = await db.collection("support").doc(uid).collection("messages").orderBy("timestamp", "asc").get();
      const msgs = snap.docs.map(d => d.data() as any);
      const hitIdx = msgs.findIndex(m => typeof m.content === "string" && /reddit/i.test(m.content));
      if (hitIdx === -1) return null;
      const start = Math.max(0, hitIdx - 1);
      const end = Math.min(msgs.length, hitIdx + 4);
      return {
        uid,
        matchAt: msgs[hitIdx].timestamp?.toMillis?.() ?? 0,
        conv: msgs.slice(start, end),
      };
    }));
    matches.push(...results.filter(Boolean) as Match[]);
  }

  console.log(`\n▸ Found ${matches.length} conversations mentioning "reddit"\n`);
  console.log("═".repeat(100));

  for (const m of matches) {
    const userSnap = await db.collection("Users").doc(m.uid).get();
    const u = userSnap.data() as any;
    const name = u?.name ?? u?.first_name ?? "(no name)";
    const email = u?.email ?? "(no email)";
    let phone = "(none on record)";
    for (const f of PHONE_FIELDS) {
      if (u?.[f]) { phone = String(u[f]); break; }
    }
    const stage = u?.treatment_stage ?? "?";

    console.log(`\n👤 ${name}`);
    console.log(`   UID:     ${m.uid}`);
    console.log(`   Email:   ${email}`);
    console.log(`   Phone:   ${phone}`);
    console.log(`   Stage:   ${stage}`);
    console.log(`   Convo:`);
    for (const msg of m.conv) {
      const who = msg.fromId === "0" ? "Aadi" : "User";
      const text = (msg.content ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      console.log(`     [${who}] ${text}`);
    }
    console.log("─".repeat(100));
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
