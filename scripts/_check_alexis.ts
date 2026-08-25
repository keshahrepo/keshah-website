import { getFirebaseAdmin } from "../lib/firebase-admin";
async function main() {
  const { db } = getFirebaseAdmin();
  const snap = await db.collection("Users").where("email", "==", "karadom562@gmail.com").limit(1).get();
  if (snap.empty) { console.log("not found"); return; }
  const doc = snap.docs[0];
  const d = doc.data();
  console.log(`uid: ${doc.id}`);
  const at = (v: unknown): string => {
    const d = (v as { toDate?: () => Date } | undefined)?.toDate?.();
    return d ? d.toISOString() : String(v ?? "-");
  };
  console.log(`email:               ${d.email}`);
  console.log(`user_type:           ${d.user_type}`);
  console.log(`treatment_stage:     ${d.treatment_stage ?? "-"}`);
  console.log(`created_at:          ${at(d.created_at)}`);
  console.log(`start_date:          ${JSON.stringify(d.start_date ?? "-")}`);
  console.log(`started_trial.at:    ${at(d.started_trial?.at)}`);
  console.log(`started_trial.source:${d.started_trial?.source ?? "-"}`);
  console.log(`converted_at:        ${at(d.converted_at)}`);
  console.log(`first_paid_at:       ${at(d.first_paid_at)}`);
  console.log(`paid_at:             ${at(d.paid_at)}`);
  console.log(`last_rc_event:       ${JSON.stringify(d.last_rc_event ?? "-")}`);
  console.log(`country_tier:        ${d.country_tier ?? "-"}`);
  console.log(`userLocalTimeZone:   ${d.userLocalTimeZone ?? "-"}`);
  console.log(`starter_photos_submit_submitted_once: ${d.starter_photos_submit_submitted_once ?? "-"}`);
  console.log(`extra_user_tags:     ${JSON.stringify(d.extra_user_tags ?? "-")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
