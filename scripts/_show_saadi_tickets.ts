// Show full thread for the 2 Saadi-candidate tickets.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const TICKETS = [
  "pWg7tepKD1a8nBKzoYdp3MlIVM82", // Sadiq (mirza102)
  "Z9dFdF4M1HcKZXMmhIMLeCOb9Vh2", // Abdullah Alsaadi
];

(async () => {
  for (const id of TICKETS) {
    const d = await db.collection("support").doc(id).get();
    if (!d.exists) { console.log(`${id}: NOT FOUND\n`); continue; }
    const x = d.data() as any;
    console.log("═".repeat(70));
    console.log(`Ticket: ${id}`);
    console.log(`Customer: ${x.customer?.name} <${x.customer?.email}>`);
    console.log(`Subject: ${x.subject || "(none)"}`);
    console.log(`Last update: ${x.last_update_at?.toDate?.()?.toISOString?.() || "-"}`);
    console.log();
    const msgs = await d.ref.collection("messages").orderBy("timestamp", "asc").get();
    for (const m of msgs.docs) {
      const mx = m.data() as any;
      const who = mx.fromId === x.customer?.id ? "USER" : "AADI";
      const t = mx.timestamp?.toDate?.()?.toISOString?.() || "";
      console.log(`  [${who} ${t}]`);
      console.log(`  ${(mx.content || "").replace(/\n/g, "\n  ")}`);
      console.log();
    }
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
