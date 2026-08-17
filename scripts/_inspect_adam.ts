import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db.collection("Users").where("email", "==", "adamstrongts115a@gmail.com").get();
  for (const d of snap.docs) {
    const x = d.data() as any;
    console.log(`uid: ${d.id}`);
    console.log(`start_date raw:`, JSON.stringify(x.start_date, null, 2));
    console.log(`created_at:`, x.created_at?.toDate?.()?.toISOString());
    console.log(`treatment_stage:`, x.treatment_stage);
    console.log(`free_stoppage_switched_at_date:`, x.free_stoppage_switched_at_date);
    console.log(`hair_loss_stoppage_reported_at:`, x.hair_loss_stoppage_reported_at?.toDate?.()?.toISOString());
    console.log(`user_local_time_zone:`, x.user_local_time_zone || x.userLocalTimeZone);
    console.log(`extra_user_tags:`, x.extra_user_tags);
    console.log(`activeRoutineDayEnd:`, x.activeRoutineDayEnd);
    console.log(`day1 task count:`, Array.isArray(x.progress?.day1) ? x.progress.day1.length : "-");
    console.log(`day1 completed count:`,
      Array.isArray(x.progress?.day1)
        ? x.progress.day1.filter((t: any) => t?.is_completed === true).length
        : "-");
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
