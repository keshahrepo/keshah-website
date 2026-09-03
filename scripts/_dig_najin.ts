import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const UID = "NtFTj5PCTGYUGLLx9xPMnEVXUMb2";
const EMAIL = "najinthant@gmail.com";

async function main() {
  console.log(`=== Full Users/${UID} doc ===\n`);
  const doc = await db.collection("Users").doc(UID).get();
  const data = doc.data() ?? {};
  const keys = Object.keys(data).sort();
  console.log(`${keys.length} fields:\n`);
  for (const k of keys) {
    const v = data[k];
    let s: string;
    if (v && typeof v === "object" && "_seconds" in v) {
      s = new Date((v as { _seconds: number })._seconds * 1000).toISOString();
    } else if (v && typeof v === "object") {
      s = JSON.stringify(v).slice(0, 200);
    } else {
      s = JSON.stringify(v);
    }
    console.log(`  ${k.padEnd(45)} = ${s}`);
  }

  // Look at fields that hint at regrowth-adjacent purchases
  console.log(`\n=== Regrowth-adjacent field scan ===`);
  const regrowthHints = keys.filter((k) =>
    /regrowth|scalp|pen|micro|kit|pin|treatment|purchase|entitle/i.test(k),
  );
  console.log(`Fields matching regex: ${regrowthHints.join(", ") || "(none)"}`);

  // Stripe customers by email
  console.log(`\n=== Stripe customers for ${EMAIL} ===`);
  const custs = await stripe.customers.list({ email: EMAIL, limit: 50 });
  console.log(`Found ${custs.data.length} customer(s)`);
  for (const c of custs.data) {
    console.log(`\n  ${c.id}  created ${new Date(c.created * 1000).toISOString()}  name=${c.name}`);

    // charges
    const charges = await stripe.charges.list({ customer: c.id, limit: 20 });
    console.log(`  charges: ${charges.data.length}`);
    for (const ch of charges.data) {
      const desc = ch.description ?? (ch as unknown as { statement_descriptor?: string }).statement_descriptor ?? "?";
      console.log(`    ${ch.id}  $${(ch.amount / 100).toFixed(2)} ${ch.currency}  ${ch.status}  ${new Date(ch.created * 1000).toISOString()}  "${desc}"`);
    }

    // payment intents (regrowth kit)
    const intents = await stripe.paymentIntents.list({ customer: c.id, limit: 20 });
    console.log(`  payment_intents: ${intents.data.length}`);
    for (const pi of intents.data) {
      const desc = pi.description ?? pi.statement_descriptor ?? "?";
      console.log(`    ${pi.id}  $${(pi.amount / 100).toFixed(2)} ${pi.currency}  ${pi.status}  ${new Date(pi.created * 1000).toISOString()}  "${desc}"  metadata=${JSON.stringify(pi.metadata).slice(0, 150)}`);
    }

    // subs
    const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 10 });
    console.log(`  subscriptions: ${subs.data.length}`);
    for (const s of subs.data) {
      const items = s.items.data.map((i) => i.price?.id).join(",");
      console.log(`    ${s.id}  ${s.status}  price=${items}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
