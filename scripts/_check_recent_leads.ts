import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const now = Date.now();
  const since = new Date(now - 14 * 86_400_000);
  const snap = await db.collection("Users")
    .where("nurture_started_at", ">=", since)
    .orderBy("nurture_started_at", "desc")
    .limit(30)
    .get();
  console.log(`Recent nurture starts (last 14d): ${snap.size}`);
  let day1eligible = 0;
  for (const d of snap.docs) {
    const x = d.data();
    const started = x.nurture_started_at?.toDate?.();
    if (!started) continue;
    const elapsedMin = (now - started.getTime()) / 60000;
    const sent: string[] = x.nurture_whatsapp_sent || [];
    const missedDay1Hook = !sent.includes("nurture_day1_trial") && elapsedMin >= 10;
    const missedDay1FAQ = !sent.includes("nurture_day1_questions") && elapsedMin >= 120;
    if (missedDay1Hook || missedDay1FAQ) day1eligible++;
    if (snap.docs.indexOf(d) < 10) {
      console.log(`  ${d.id.slice(0,8)} · ${started.toISOString()} · +${Math.round(elapsedMin)}min · sent=[${sent.join(",")}] · src=${x.signup_source || "-"} · completed=${x.nurture_completed || false}`);
    }
  }
  console.log(`\nLeads that SHOULD have received day 1 msgs but haven't: ${day1eligible}`);
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
