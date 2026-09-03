import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", "==", "test123@test.com").get();
  for (const d of snap.docs) {
    const u: any = d.data();
    const day1 = u.progress?.day1;
    const anyCompleted = Array.isArray(day1) && day1.some((e: any) => e?.is_completed === true);
    console.log("uid:", d.id, "email:", u.email);
    console.log("  keshah_alarm_walkthrough_seen:", u.keshah_alarm_walkthrough_seen);
    console.log("  alarm_walkthrough_outcome:", u.alarm_walkthrough_outcome);
    console.log("  starter_photos_submitted_once:", u.starter_photos_submitted_once);
    console.log("  starterPhotosShowedOnce:", u.starterPhotosShowedOnce);
    console.log("  day1 tasks:", Array.isArray(day1) ? day1.length : "n/a");
    console.log("  day1 anyCompleted:", anyCompleted);
    if (Array.isArray(day1)) {
      day1.forEach((e:any, i:number) => console.log(`    task${i}: ${e?.exercise_id} · completed=${e?.is_completed}`));
    }
  }
})();
