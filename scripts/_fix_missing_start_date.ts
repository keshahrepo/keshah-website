// Backfill start_date = today for every freev2 FREE_STOPPAGE user missing it.
// These users paid (many are paidStoppage India Razorpay) but their doc never
// got start_date set, so the calendar renders empty and Learning stays locked.
// Setting start_date to today gives them a fresh day 1.
//
// DRY RUN by default. Pass APPLY=1 to write.
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const APPLY = process.env.APPLY === "1";

function istStartDate(): {date:string;timeZoneOffsetInMins:number;timezone:string;time:string} {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = ist.getUTCFullYear();
  let h = ist.getUTCHours();
  const min = String(ist.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return {
    date: `${dd}/${mm}/${yyyy}`,
    timeZoneOffsetInMins: 330,
    timezone: "IST",
    time: `${String(h).padStart(2,"0")}:${min} ${ampm}`,
  };
}

(async () => {
  const start_date = istStartDate();
  console.log(`Backfilling start_date = ${JSON.stringify(start_date)}\n`);

  const snap = await db.collection("Users")
    .where("user_type", "==", "freev2")
    .where("treatment_stage", "==", "FREE_STOPPAGE")
    .get();
  console.log(`freev2 FREE_STOPPAGE total: ${snap.size}`);

  const missing: { id: string; email: string; created: string; tags: string[] }[] = [];
  for (const d of snap.docs) {
    const x = d.data() as any;
    if (x.is_deleted) continue;
    if (x.start_date) continue;
    missing.push({
      id: d.id,
      email: x.email || "-",
      created: x.created_at?.toDate?.()?.toISOString?.() || "-",
      tags: x.extra_user_tags || [],
    });
  }
  console.log(`Missing start_date: ${missing.length}\n`);
  console.log("First 10 samples:");
  for (const u of missing.slice(0, 10)) {
    console.log(`  ${u.id}  ${u.email.padEnd(38)} created=${u.created.slice(0,10)}  tags=${JSON.stringify(u.tags)}`);
  }

  const tagBreakdown: Record<string, number> = {};
  for (const u of missing) {
    const key = u.tags.length ? u.tags.sort().join(",") : "(no tags)";
    tagBreakdown[key] = (tagBreakdown[key] || 0) + 1;
  }
  console.log(`\nTag breakdown:`);
  for (const [k, v] of Object.entries(tagBreakdown).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${k.padEnd(30)} ${v}`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN. Re-run with APPLY=1 to write to all ${missing.length}.`);
    process.exit(0);
  }

  console.log(`\nWriting start_date to ${missing.length} docs…`);
  let ok = 0, fail = 0;
  for (let i = 0; i < missing.length; i++) {
    try {
      await db.collection("Users").doc(missing[i].id).update({ start_date });
      ok++;
    } catch (e: any) {
      fail++;
      console.log(`  ✗ ${missing[i].id} ${missing[i].email}: ${e.message}`);
    }
    if (i > 0 && i % 25 === 0) console.log(`  …${i}/${missing.length}  ok=${ok} fail=${fail}`);
  }
  console.log(`\nDone. ok=${ok} fail=${fail}`);
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
