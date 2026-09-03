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
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const UID = "kKxhxVcgME188I1PVLtK";
const EMAIL = "theodubreuil@hotmail.fr";

async function rcSubscriber(uid: string) {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${RC_KEY}` } },
  );
  if (!res.ok) return { error: `HTTP ${res.status}`, body: await res.text() };
  return await res.json();
}

interface Ex {
  exercise_id?: string;
  duration?: number;
  is_completed?: boolean;
}

async function main() {
  const doc = await db.collection("Users").doc(UID).get();
  const data = doc.data() ?? {};

  console.log(`=== Users/${UID} full field list (${Object.keys(data).length}) ===\n`);
  for (const k of Object.keys(data).sort()) {
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

  // Progress buckets
  const buckets: { name: string; map: Record<string, Ex[]> }[] = [
    { name: "progress", map: (data.progress ?? {}) as Record<string, Ex[]> },
    { name: "aftercare_progress", map: (data.aftercare_progress ?? {}) as Record<string, Ex[]> },
    { name: "regrowth_progress", map: (data.regrowth_progress ?? {}) as Record<string, Ex[]> },
  ];

  for (const b of buckets) {
    const days = Object.keys(b.map).sort((a, z) => {
      const na = parseInt(a.replace(/\D/g, ""), 10);
      const nz = parseInt(z.replace(/\D/g, ""), 10);
      return na - nz;
    });
    console.log(`\n═══ ${b.name} (${days.length} days) ═══`);
    if (days.length === 0) continue;
    console.log(`first: ${days[0]}   last: ${days[days.length - 1]}`);

    const idCounts: Record<string, number> = {};
    const idDurations: Record<string, Set<number>> = {};
    let totalMin = 0;
    for (const day of days) {
      const list = b.map[day] ?? [];
      for (const ex of list) {
        const id = ex.exercise_id ?? "(no-id)";
        idCounts[id] = (idCounts[id] ?? 0) + 1;
        const dur = ex.duration ?? 0;
        if (!idDurations[id]) idDurations[id] = new Set();
        idDurations[id].add(dur);
        totalMin += dur;
      }
    }
    for (const id of Object.keys(idCounts).sort((a, z) => idCounts[z] - idCounts[a])) {
      const durs = [...(idDurations[id] ?? [])].sort();
      console.log(`  ${id.padEnd(40)}  x${idCounts[id]}   durations: ${durs.join(", ")} min`);
    }
    console.log(`total minutes logged: ${totalMin}`);
  }

  // RC full state
  console.log(`\n═══ RC subscriber ═══`);
  const rc = await rcSubscriber(UID);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rcAny = rc as any;
  if (rcAny.subscriber) {
    console.log(`  first_seen: ${rcAny.subscriber.first_seen}`);
    console.log(`  original_app_user_id: ${rcAny.subscriber.original_app_user_id}`);
    console.log(`  original_purchase_date: ${rcAny.subscriber.original_purchase_date}`);
    console.log(`  entitlements:`);
    for (const [k, e] of Object.entries(rcAny.subscriber.entitlements ?? {})) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyE = e as any;
      console.log(`    ${k}: expires=${anyE.expires_date ?? "never"}, product=${anyE.product_identifier}, purchased=${anyE.purchase_date}`);
    }
    console.log(`  subscriptions:`);
    for (const [pid, s] of Object.entries(rcAny.subscriber.subscriptions ?? {})) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyS = s as any;
      console.log(`    ${pid}: expires=${anyS.expires_date}, store=${anyS.store}, unsubscribe=${anyS.unsubscribe_detected_at}, billing_issues=${anyS.billing_issues_detected_at}, refunded=${anyS.refunded_at}`);
    }
    console.log(`  non_subscriptions (one-time):`);
    for (const [pid, arr] of Object.entries(rcAny.subscriber.non_subscriptions ?? {})) {
      console.log(`    ${pid}: ${JSON.stringify(arr).slice(0, 300)}`);
    }
  } else {
    console.log(JSON.stringify(rc).slice(0, 500));
  }

  // Stripe history
  console.log(`\n═══ Stripe (email ${EMAIL}) ═══`);
  const custs = await stripe.customers.list({ email: EMAIL, limit: 20 });
  console.log(`  ${custs.data.length} customer(s)`);
  for (const c of custs.data) {
    console.log(`  ${c.id}  created ${new Date(c.created * 1000).toISOString()}`);
    const intents = await stripe.paymentIntents.list({ customer: c.id, limit: 20 });
    for (const pi of intents.data) {
      const desc = pi.description ?? pi.statement_descriptor ?? "?";
      console.log(`    intent ${pi.id}  $${(pi.amount / 100).toFixed(2)} ${pi.currency}  ${pi.status}  ${new Date(pi.created * 1000).toISOString()}  "${desc}"`);
    }
    const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 10 });
    for (const s of subs.data) {
      console.log(`    sub ${s.id}  ${s.status}  price=${s.items.data.map((i) => i.price?.id).join(",")}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
