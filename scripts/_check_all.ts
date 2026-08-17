import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  // 1. Any trial_status docs at all?
  const trialSnap = await db.collection("Users").where("trial_status", "==", "active").limit(20).get();
  console.log("ACTIVE TRIALS:", trialSnap.size);

  // 2. Any razorpay_subscription_id docs at all (paid or trial)?
  const rzpSnap = await db.collection("Users").where("razorpay_subscription_id", "!=", null).limit(20).get();
  console.log("RAZORPAY SUBS (paid or trial):", rzpSnap.size);
  rzpSnap.docs.slice(0, 10).forEach(d => {
    const x = d.data();
    const trial = x.trial_status || "none";
    const rzpPlan = x.razorpay_plan || x.plan || "?";
    const sub = x.razorpay_subscription_id?.slice(0,15) || "?";
    const emailOrPhone = x.email || x.phone_number?.complete_number || "no-id";
    console.log(`  ${d.id.slice(0,8)} · trial=${trial} · plan=${rzpPlan} · sub=${sub} · ${emailOrPhone}`);
  });

  // 3. Recent /startindia leads (by signup_source)
  const leadSnap = await db.collection("Users").where("signup_source", "==", "web_funnel").orderBy("created_at", "desc").limit(5).get();
  console.log("\nLATEST WEB_FUNNEL LEADS:", leadSnap.size);
  leadSnap.docs.forEach(d => {
    const x = d.data();
    const created = x.created_at?.toDate?.()?.toISOString().slice(0,19) || "?";
    console.log(`  ${d.id.slice(0,8)} · ${created} · ${x.first_name || "?"} · ${x.phone_number?.complete_number || "?"}`);
  });
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
