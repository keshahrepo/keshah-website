import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();

const EMAIL = "kc2c5hmyj8@privaterelay.appleid.com";

(async () => {
  let uid: string | null = null;
  try {
    const u = await auth.getUserByEmail(EMAIL);
    uid = u.uid;
    console.log(`Auth UID: ${uid}`);
    console.log(`Created: ${u.metadata.creationTime}`);
    console.log(`Last sign-in: ${u.metadata.lastSignInTime}`);
    console.log(`Providers: ${u.providerData.map(p => p.providerId).join(", ")}`);
  } catch (e: any) {
    console.log(`Auth lookup failed: ${e.message}`);
  }

  if (!uid) {
    const q = await db.collection("Users").where("email", "==", EMAIL).limit(3).get();
    if (!q.empty) {
      uid = q.docs[0].id;
      console.log(`Found by Firestore email: ${uid}`);
    }
  }

  if (!uid) { console.log("No user found"); process.exit(1); }

  const doc = await db.collection("Users").doc(uid).get();
  if (!doc.exists) { console.log("No Firestore doc"); process.exit(1); }
  const x = doc.data() as any;

  console.log(`\n--- Treatment ---`);
  console.log(`treatment_stage:   ${x.treatment_stage}`);
  console.log(`user_type:         ${x.user_type}`);
  console.log(`gender:            ${x.selected_gender}`);
  console.log(`extra_user_tags:   ${JSON.stringify(x.extra_user_tags)}`);
  console.log(`start_date:        ${x.start_date?.toDate?.()?.toISOString() || x.start_date || "-"}`);
  console.log(`paid_at:           ${x.paid_at?.toDate?.()?.toISOString() || "-"}`);
  console.log(`payment_provider:  ${x.payment_provider || "-"}`);
  console.log(`razorpay_sub:      ${x.razorpay_subscription_id || "-"}`);

  // Progress fields
  for (const k of Object.keys(x).sort()) {
    if (/progress|day|stoppage|regrowth|pen/i.test(k)) {
      const v = x[k];
      let s = v?.toDate ? v.toDate().toISOString() : typeof v === "object" ? JSON.stringify(v).slice(0, 200) : String(v);
      if (s.length > 200) s = s.slice(0, 200) + "…";
      console.log(`  ${k}: ${s}`);
    }
  }

  // Look for progress subcollection or progress fields with day numbers
  const subs = await doc.ref.listCollections();
  console.log(`\nSubcollections: ${subs.map(c => c.id).join(", ") || "none"}`);

  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
