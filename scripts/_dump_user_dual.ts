import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  // Same query the mobile app runs
  const snap = await db.collection("Users")
    .where("wp_user.user_email", "==", email)
    .where("is_deleted", "==", false)
    .get();
  console.log(`Mobile-app-style query for ${email}: ${snap.size} doc(s) matched\n`);
  snap.docs.forEach((d, i) => {
    const x = d.data();
    console.log(`[${i}] UID: ${d.id}`);
    console.log(`    user_type: ${x.user_type ?? "-"}`);
    console.log(`    treatment_stage: ${x.treatment_stage ?? "-"}`);
    console.log(`    start_date: ${JSON.stringify(x.start_date) ?? "-"}`);
    console.log(`    paid_at: ${x.paid_at?.toDate?.()?.toISOString() ?? x.paid_at ?? "-"}`);
    console.log(`    starter_photos_submit_submitted_once: ${x.starter_photos_submit_submitted_once ?? "-"}`);
    console.log(`    wp_user.user_email: ${x.wp_user?.user_email ?? "-"}`);
    console.log(`    wp_user.ID: ${x.wp_user?.ID ?? "-"}`);
    console.log(`    is_deleted: ${x.is_deleted ?? "-"}`);
    console.log(``);
  });
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
