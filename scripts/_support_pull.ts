// Pulls support tickets awaiting reply (last_message from customer) in
// the last 2 days, plus each customer's treatment state, formatted for
// Claude to draft replies. Sorted oldest-first.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

function calcDay(stage: string, x: any): string {
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  if (stage === "REGROWTH") {
    const swStr: string | undefined = x.regrowth_switched_at_date;
    if (swStr) {
      const [d, m, y] = swStr.split("/").map(Number);
      const sw = new Date(Date.UTC(y, m - 1, d));
      const days = Math.floor((Date.now() - sw.getTime()) / 86400000) + 1;
      return `regrowth Day ${days} (switched ${fmt(sw)})`;
    }
  }
  // Stoppage / free — use start_date
  const startRaw = x.start_date;
  if (startRaw) {
    const t = startRaw?.toDate?.()?.getTime?.() || (typeof startRaw === "string" ? Date.parse(startRaw) : 0);
    if (t) {
      const days = Math.floor((Date.now() - t) / 86400000) + 1;
      return `${stage} Day ${days} (started ${fmt(new Date(t))})`;
    }
  }
  // Fallback — count progress.dayN keys
  const dayKeys = Object.keys(x.progress || {}).filter(k => k.startsWith("day"));
  return `${stage} (~${dayKeys.length} days completed by progress)`;
}

(async () => {
  const cutoff = new Date(Date.now() - 2 * 86400_000);
  const all = await db.collection("support").where("last_update_at", ">=", cutoff).get();

  // Filter to "awaiting reply"
  const awaiting = all.docs.filter(d => {
    const x = d.data() as any;
    return x.last_message?.fromId === x.customer?.id;
  });

  // Sort oldest-first by last_update_at
  awaiting.sort((a, b) => {
    const ta = a.data().last_update_at?._seconds ?? 0;
    const tb = b.data().last_update_at?._seconds ?? 0;
    return ta - tb;
  });

  const limit = parseInt(process.argv[2] ?? "5", 10);
  const offset = parseInt(process.argv[3] ?? "0", 10);
  const slice = awaiting.slice(offset, offset + limit);

  console.log(`Total awaiting reply: ${awaiting.length}. Showing ${slice.length} (offset=${offset}, limit=${limit})\n`);

  for (let i = 0; i < slice.length; i++) {
    const d = slice[i];
    const x = d.data() as any;
    const customer = x.customer;
    console.log(`════════════════ TICKET ${offset + i + 1}/${awaiting.length} ════════════════`);
    console.log(`ID:    ${d.id}`);
    console.log(`Name:  ${customer?.name}`);
    console.log(`Email: ${customer?.email}`);

    // Pull user state
    let userInfo = "(no user doc)";
    if (customer?.id) {
      const u = await db.collection("Users").doc(customer.id).get();
      if (u.exists) {
        const ux = u.data() as any;
        const stage = ux.treatment_stage ?? "?";
        userInfo =
          `stage=${stage} | ` +
          calcDay(stage, ux) +
          ` | gender=${ux.selected_gender ?? "?"} | goal=${ux.hair_goal ?? "?"} | location=${ux.hair_loss_location ?? "?"} | ` +
          `paid_at=${ux.paid_at?.toDate?.()?.toISOString?.() ?? "-"} | ` +
          `payment=${ux.payment_provider ?? "-"} | ` +
          `tags=${JSON.stringify(ux.extra_user_tags ?? [])} | ` +
          `regrowth_purchased=${ux.regrowth_treatment_purchased ?? false} | ` +
          `regrowth_session_day=${ux.regrowth_session_day ?? "-"}`;
      }
    }
    console.log(`User:  ${userInfo}`);

    // Thread
    const msgs = await d.ref.collection("messages").orderBy("timestamp", "asc").get();
    console.log(`Thread (${msgs.size} msgs):`);
    for (const m of msgs.docs) {
      const mx = m.data() as any;
      const who = mx.fromId === customer?.id ? "USER" : "AADI";
      const t = mx.timestamp?.toDate?.()?.toISOString?.() ?? "";
      const content = (mx.content || "").replace(/\n/g, "\n         ");
      console.log(`  [${who} ${t}]\n         ${content}`);
    }
    console.log();
  }
  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
