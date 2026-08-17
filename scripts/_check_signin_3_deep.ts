import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const USERS = [
  { email: "mojibzzzzz@gmail.com", uid: "E5k4b3gKM1Obv2aOwRgEJzPdo2s2" },
  { email: "siddgarud1999@gmail.com", uid: "yASx0UHqAYRj8rEcHclW3Vy3iW63" },
  { email: "kdhenge@gmail.com", uid: "HYzoCxFdffa5g1QXUnBCgfmrSaL2" },
];

async function rc(uid: string) {
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${RC_KEY}` },
    });
    if (!res.ok) return { error: `${res.status}` };
    return await res.json();
  } catch (e: any) { return { error: e.message }; }
}

(async () => {
  for (const { email, uid } of USERS) {
    console.log(`\n═══ ${email} (uid=${uid}) ═══`);

    // Full Firestore doc
    const doc = await db.collection("Users").doc(uid).get();
    if (doc.exists) {
      const x = doc.data() as any;
      const fields = Object.keys(x).sort();
      console.log(`  ALL FIELDS in Users/${uid} (${fields.length} keys):`);
      for (const k of fields) {
        const v = x[k];
        let s: string;
        if (v?.toDate) s = v.toDate().toISOString();
        else if (typeof v === "object") s = JSON.stringify(v);
        else s = String(v);
        if (s.length > 80) s = s.slice(0, 80) + "…";
        console.log(`    ${k.padEnd(28)} ${s}`);
      }
    } else {
      console.log(`  Users/${uid}: DOES NOT EXIST`);
    }

    // Other Firestore docs with same email (duplicate UIDs)
    const lower = email.toLowerCase();
    const dupes = await db.collection("Users").where("email", "==", lower).get();
    const otherDocs = dupes.docs.filter(d => d.id !== uid);
    if (otherDocs.length > 0) {
      console.log(`  ⚠️  ${otherDocs.length} OTHER Firestore docs with email=${lower}:`);
      for (const d of otherDocs) {
        const x = d.data() as any;
        console.log(`    DUPLICATE doc ${d.id}: providerId=${x.providerId} created=${x.created_at?.toDate?.()?.toISOString() || "-"} stage=${x.treatment_stage}`);
      }
    }

    // RC subscriber lookup
    const sub: any = await rc(uid);
    if (sub.error) {
      console.log(`  RC: ${sub.error}`);
    } else {
      const ents = sub.subscriber?.entitlements || {};
      const subs = sub.subscriber?.subscriptions || {};
      console.log(`  RC entitlements: ${Object.keys(ents).length || "none"}`);
      for (const [name, ent] of Object.entries(ents) as any) {
        const active = new Date(ent.expires_date).getTime() > Date.now();
        console.log(`    ${name}: ${active ? "ACTIVE" : "EXPIRED"} expires=${ent.expires_date} product=${ent.product_identifier}`);
      }
      console.log(`  RC subscriptions: ${Object.keys(subs).length || "none"}`);
      for (const [pid, s] of Object.entries(subs) as any) {
        console.log(`    ${pid}: store=${s.store} purchased=${s.purchase_date} expires=${s.expires_date} unsubscribe=${s.unsubscribe_detected_at || "-"}`);
      }
    }

    // FunnelEvents — find their session by trying to match
    // (FunnelEvents doesn't have email — skip unless we can derive sessionId)

    // Razorpay subscriptions for this user
    const rzpSubs = await db.collection("razorpay_subscriptions").where("notes.uid", "==", uid).limit(5).get();
    if (rzpSubs.size > 0) {
      console.log(`  Razorpay subs: ${rzpSubs.size}`);
      for (const d of rzpSubs.docs) {
        const x = d.data();
        console.log(`    ${d.id}: status=${x.status} created=${x.created_at}`);
      }
    }

    // Check for any payment activity
    const payments = await db.collection("Users").doc(uid).collection("payments").limit(5).get();
    if (payments.size > 0) {
      console.log(`  Payments subcollection: ${payments.size} docs`);
      for (const d of payments.docs) {
        const x = d.data();
        console.log(`    ${d.id}: ${JSON.stringify(x).slice(0, 120)}`);
      }
    }
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
