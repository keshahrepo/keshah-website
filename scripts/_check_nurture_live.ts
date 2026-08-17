import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86_400_000);

  // Band A: users who started nurture 3-14 days ago (should have emails 1..N)
  const bandA = await db.collection("Users")
    .where("nurture_started_at", ">=", Timestamp.fromDate(days(14)))
    .where("nurture_started_at", "<=", Timestamp.fromDate(days(3)))
    .limit(200)
    .get();

  console.log(`\nBand A (3-14 days ago): ${bandA.docs.length} sampled`);
  let sentAny = 0, none = 0, paid = 0, unsub = 0, bounce = 0;
  const daysSent = new Map<number, number>();
  const noneEligible: any[] = [];
  for (const d of bandA.docs) {
    const x = d.data() as any;
    const sent: number[] = x.nurture_emails_sent || [];
    if (x.start_date) paid++;
    if (x.nurture_email_unsubscribed) unsub++;
    if (x.nurture_email_bounced) bounce++;
    if (sent.length > 0) {
      sentAny++;
      for (const day of sent) daysSent.set(day, (daysSent.get(day) || 0) + 1);
    } else {
      none++;
      if (!x.start_date && !x.nurture_email_unsubscribed && !x.nurture_email_bounced) {
        if (noneEligible.length < 6) noneEligible.push({
          uid: d.id,
          email: x.email,
          started: x.nurture_started_at?.toDate?.()?.toISOString(),
          tz: x.user_local_time_zone,
          has_first_name: !!x.first_name,
        });
      }
    }
  }
  console.log(`  received emails: ${sentAny}`);
  console.log(`  received zero:   ${none}   (of these ${paid} paid, ${unsub} unsub, ${bounce} bounced)`);
  const zeroLegit = none - paid - unsub - bounce;
  console.log(`  zero-but-eligible: ${zeroLegit}`);
  console.log(`  day-of-drip histogram:`);
  for (const day of [...daysSent.keys()].sort((a, b) => a - b)) {
    console.log(`    day ${day}: ${daysSent.get(day)}`);
  }
  console.log(`  sample zero-but-eligible users (missed sends):`);
  for (const s of noneEligible) console.log(`    ${JSON.stringify(s)}`);

  // Band B: users who started nurture 1-3 days ago (Day 1-3 window)
  const bandB = await db.collection("Users")
    .where("nurture_started_at", ">=", Timestamp.fromDate(days(3)))
    .where("nurture_started_at", "<=", Timestamp.fromDate(days(1)))
    .limit(100)
    .get();

  let sentAnyB = 0, noneB = 0;
  const daysSentB = new Map<number, number>();
  for (const d of bandB.docs) {
    const x = d.data() as any;
    const sent: number[] = x.nurture_emails_sent || [];
    if (sent.length > 0) {
      sentAnyB++;
      for (const day of sent) daysSentB.set(day, (daysSentB.get(day) || 0) + 1);
    } else noneB++;
  }
  console.log(`\nBand B (1-3 days ago): ${bandB.docs.length} sampled`);
  console.log(`  received emails: ${sentAnyB}, zero: ${noneB}`);
  for (const day of [...daysSentB.keys()].sort((a, b) => a - b)) {
    console.log(`    day ${day}: ${daysSentB.get(day)}`);
  }

  // Global: when was the most recent nurture email send? Order by nurture_emails_sent... can't easily.
  // Instead: check bounce/unsub timestamps to see the last SES activity.
  const bounceSnap = await db.collection("Users")
    .where("nurture_email_bounced", "==", true)
    .orderBy("nurture_email_bounced_at", "desc")
    .limit(3)
    .get();
  console.log(`\nMost recent bounces (last SES round-trip signal):`);
  for (const d of bounceSnap.docs) {
    const x = d.data() as any;
    console.log(`  ${d.id} bounced_at=${x.nurture_email_bounced_at?.toDate?.()?.toISOString() || "?"}`);
  }

  const unsubSnap = await db.collection("Users")
    .where("nurture_email_unsubscribed", "==", true)
    .orderBy("nurture_email_unsubscribed_at", "desc")
    .limit(3)
    .get();
  console.log(`\nMost recent unsubscribes:`);
  for (const d of unsubSnap.docs) {
    const x = d.data() as any;
    console.log(`  ${d.id} unsub_at=${x.nurture_email_unsubscribed_at?.toDate?.()?.toISOString() || "?"}`);
  }

  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
