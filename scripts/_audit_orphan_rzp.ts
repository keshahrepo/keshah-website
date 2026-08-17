// Audits every Razorpay subscription for orphan status: paid at least
// once but no Firestore Users doc has the sub ID stored. Reports email
// + paid_count so we can decide whether to reconcile.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RZP_KEY = process.env.RAZORPAY_KEY_ID!;
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET!;
const AUTH = "Basic " + Buffer.from(`${RZP_KEY}:${RZP_SECRET}`).toString("base64");

async function fetchSubs(skip: number, count: number) {
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions?count=${count}&skip=${skip}`, {
    headers: { Authorization: AUTH },
  });
  const j: any = await res.json();
  return j.items || [];
}

(async () => {
  const orphans: any[] = [];
  const allSubs: any[] = [];

  for (let skip = 0; skip < 500; skip += 100) {
    const batch = await fetchSubs(skip, 100);
    if (batch.length === 0) break;
    allSubs.push(...batch);
    if (batch.length < 100) break;
  }
  console.log(`Total subs fetched: ${allSubs.length}`);

  const paidSubs = allSubs.filter((s) => s.paid_count >= 1);
  console.log(`With paid_count≥1: ${paidSubs.length}`);

  for (const s of paidSubs) {
    const q = await db.collection("Users").where("razorpay_subscription_id", "==", s.id).limit(1).get();
    if (q.empty) {
      orphans.push(s);
    }
  }

  console.log(`\n=== ORPHAN subs (paid but no Firestore linkage) ===`);
  console.log(`Count: ${orphans.length}`);
  for (const s of orphans) {
    console.log(`\n  ${s.id}  status=${s.status}  plan=${s.plan_id}  paid_count=${s.paid_count}`);
    console.log(`    email:   ${s.customer_email}`);
    console.log(`    phone:   ${s.customer_contact}`);
    console.log(`    notes:   ${JSON.stringify(s.notes)}`);
    console.log(`    created: ${new Date((s.created_at ?? 0) * 1000).toISOString()}`);

    if (s.customer_email) {
      const byEmail = await db.collection("Users").where("email", "==", s.customer_email.toLowerCase()).limit(3).get();
      if (!byEmail.empty) {
        for (const d of byEmail.docs) {
          const x = d.data();
          console.log(`    ↳ Firestore doc ${d.id} exists (stage=${x.treatment_stage}, provider=${x.providerId})`);
        }
      } else {
        console.log(`    ↳ no Firestore doc by email`);
      }
    }
  }
  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
