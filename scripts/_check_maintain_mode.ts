import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const snap = await db.collection("Users").where("wp_user.user_email", "==", email).limit(1).get();
  if (snap.empty) {
    console.log("Not found");
    process.exit(1);
  }
  const x = snap.docs[0].data() as Record<string, unknown>;
  const fields = [
    "maintenance_mode_active",
    "treatment_stage",
    "free_maintenance_switched_at_date",
    "alarm_walkthrough_seen",
    "keshah_alarm_walkthrough_seen",
    "starter_photos_submit_submitted_once",
    "selected_gender",
    "user_local_time_zone",
    "user_type",
    "is_deleted",
    "modified_at",
  ];
  for (const f of fields) {
    let v: unknown = x[f];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (v && (v as any)?.toDate) v = (v as any).toDate().toISOString();
    console.log(`${f.padEnd(38)}: ${JSON.stringify(v ?? "(unset)")}`);
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
