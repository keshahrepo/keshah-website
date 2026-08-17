// Scan last 7 days of support messages for bug-pattern keywords —
// "needs-fixing" candidates that Aadi may have replied to but still
// require a code/data fix on our side.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const BUG_KEYWORDS = [
  /\bnot working\b/i, /\bbroken\b/i, /\bdoesn'?t work\b/i, /\bcan'?t open\b/i,
  /\bwon'?t load\b/i, /\berror\b/i, /\bstuck\b/i, /\breset\b/i, /\bglitch\b/i,
  /\bbug\b/i, /\bcrash/i, /\blost\b/i, /\bmissing\b/i, /\bblank\b/i,
  /\bcan'?t see\b/i, /\bnot able to\b/i, /\bnot showing\b/i, /\bnot tracking\b/i,
  /\bdidn'?t get\b/i, /\bnever got\b/i, /\bzip code\b/i, /\bship.*not\b/i,
  /\bcharged\b/i, /\bdouble.charge/i, /\brefund/i, /\bcancel.*not\b/i,
  /\bstreak.*0\b/i, /\bday 1\b/i, /\baccess\b/i,
];

(async () => {
  const cutoff = new Date(Date.now() - 7 * 86400_000);
  const recent = await db.collection("support").where("last_update_at", ">=", cutoff).get();
  console.log(`Scanning ${recent.size} threads from last 7 days...\n`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hits: Array<{ ticket: any; msg: any; matched: string[]; thread: string }> = [];

  for (const d of recent.docs) {
    const x = d.data();
    const msgs = await d.ref.collection("messages").orderBy("timestamp", "asc").get();
    for (const m of msgs.docs) {
      const mx = m.data();
      if (mx.fromId !== x.customer?.id) continue; // user messages only
      const content = (mx.content || "") as string;
      if (!content || content.length < 8) continue;
      // Only messages within the cutoff window
      const ts = mx.timestamp?.toDate?.()?.getTime?.() ?? 0;
      if (ts < cutoff.getTime()) continue;

      const matched = BUG_KEYWORDS.filter((re) => re.test(content)).map((re) => re.source);
      if (matched.length === 0) continue;
      hits.push({ ticket: { id: d.id, ...x }, msg: { ...mx, ts }, matched, thread: msgs.docs.map(mm => mm.data()).map((mm: any) => `[${mm.fromId === x.customer?.id ? "U" : "A"}] ${(mm.content || "").slice(0, 200)}`).join("\n  ") });
    }
  }

  hits.sort((a, b) => b.msg.ts - a.msg.ts);
  console.log(`Found ${hits.length} bug-pattern messages from users.\n`);

  // Group by ticket to avoid duplicates
  const byTicket = new Map<string, typeof hits[number]>();
  for (const h of hits) {
    if (!byTicket.has(h.ticket.id)) byTicket.set(h.ticket.id, h);
  }
  console.log(`Across ${byTicket.size} unique users.\n`);

  let i = 1;
  for (const h of byTicket.values()) {
    const t = new Date(h.msg.ts);
    console.log(`════════ ${i++}. ${h.ticket.customer?.name || "?"} — ${h.ticket.customer?.email || "?"}`);
    console.log(`UID:     ${h.ticket.customer?.id}`);
    console.log(`When:    ${t.toISOString()}`);
    console.log(`Matched: ${h.matched.join(", ")}`);
    console.log(`Latest user msg:`);
    console.log(`  "${(h.msg.content || "").slice(0, 280).replace(/\n/g, " ")}"`);
    console.log();
  }
  process.exit(0);
})();
