import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db.collection("Users").where("email", "==", "dnisa1580@gmail.com").limit(1).get();
  if (snap.empty) { console.log("not found"); process.exit(0); }
  const d = snap.docs[0].data();
  console.log(`\nUID: ${snap.docs[0].id}`);
  console.log(`email:              ${d.email}`);
  console.log(`referral_source:    ${d.referral_source ?? "(unset)"}`);
  console.log(`selected_gender:    ${d.selected_gender ?? "(unset)"}`);
  console.log(`signup_source:      ${d.signup_source ?? "(unset)"}`);
  console.log(`created_at:         ${d.created_at?.toDate?.()?.toISOString() ?? "(unset)"}`);
  console.log(`start_date:         ${d.start_date ? JSON.stringify(d.start_date) : "(unset)"}`);
  console.log(`userLocalTimeZone:  ${d.userLocalTimeZone ?? "(unset)"}`);
  console.log(`extra_user_tags:    ${JSON.stringify(d.extra_user_tags ?? [])}`);
  console.log(`user_type:          ${d.user_type ?? "(unset)"}`);
  console.log(`treatment_stage:    ${d.treatment_stage ?? "(unset)"}`);
  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
