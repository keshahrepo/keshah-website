import { getFirebaseAdmin } from "../lib/firebase-admin";
async function main() {
  const { db } = getFirebaseAdmin();
  const s = await db.doc("Settings/app_general_settings").get();
  const d = s.data() ?? {};
  console.log("onboarding_call_post_purchase_enabled:",
    d.onboarding_call_post_purchase_enabled ?? "(missing)");
  console.log("onboarding_call_post_purchase_calendly_url:",
    d.onboarding_call_post_purchase_calendly_url ?? "(missing)");
}
main().catch((e) => { console.error(e); process.exit(1); });
