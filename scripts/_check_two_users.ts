// Triage both users for the same reported issue.
// Usage: npx tsx scripts/_check_two_users.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const EMAILS = ["optionlimite@gmail.com", "najinthant@gmail.com"];

async function rc(uid: string) {
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${RC_KEY}` } }
    );
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e: any) {
    return { error: e.message };
  }
}

(async () => {
  for (const email of EMAILS) {
    console.log(`\n═══════════════ ${email} ═══════════════`);

    let authUid: string | null = null;
    try {
      const u = await auth.getUserByEmail(email);
      authUid = u.uid;
      console.log(`  Auth uid: ${u.uid}  providers=${u.providerData.map(p => p.providerId).join("/")}  created=${u.metadata.creationTime}`);
    } catch (e: any) {
      console.log(`  Auth: NOT FOUND`);
    }

    const byEmail = await db.collection("Users").where("email", "==", email).get();
    console.log(`  Firestore docs by email: ${byEmail.size}`);
    for (const d of byEmail.docs) {
      const x = d.data();
      console.log(`\n  ── doc ${d.id} ──`);
      console.log(`    user_type:                  ${x.user_type || "-"}`);
      console.log(`    selected_gender:            ${x.selected_gender || "-"}`);
      console.log(`    country:                    ${x.phone_number?.country_code || "-"}`);
      console.log(`    created_at:                 ${x.created_at?.toDate?.()?.toISOString() || "-"}`);
      console.log(`    start_date:                 ${JSON.stringify(x.start_date) || "-"}`);
      console.log(`    treatment_stage:            ${x.treatment_stage || "-"}`);
      console.log(`    free_stoppage_switched_at:  ${x.free_stoppage_switched_at_date || "-"}`);
      console.log(`    free_maintenance_switched:  ${x.free_maintenance_switched_at_date || "-"}`);
      console.log(`    regrowth_switched_at:       ${x.regrowth_switched_at_date || "-"}`);
      console.log(`    free_stoppage_ext_switched: ${x.free_stoppage_ext_switched_at_date || "-"}`);
      console.log(`    hair_loss_stoppage_at:      ${x.hair_loss_stoppage_reported_at?.toDate?.()?.toISOString() || "-"}`);
      console.log(`    user_local_time_zone:       ${x.user_local_time_zone || "-"}`);
      console.log(`    extra_user_tags:            ${JSON.stringify(x.extra_user_tags ?? [])}`);
      console.log(`    converted_at:               ${x.converted_at?.toDate?.()?.toISOString() || "-"}`);
      console.log(`    paid_at:                    ${x.paid_at?.toDate?.()?.toISOString() || "-"}`);
      console.log(`    open_account:               ${x.open_account ?? "-"}`);
      console.log(`    pro:                        ${x.pro ?? "-"}`);
      console.log(`    qr_scanned:                 ${x.qr_scanned ?? "-"}`);
      console.log(`    starter_photos_submitted:   ${x.starter_photos_submit_submitted_once ?? "-"}`);
      console.log(`    has progress:               ${x.progress ? Object.keys(x.progress).length + " days" : "-"}`);
      console.log(`    has regrowth_progress:      ${x.regrowth_progress ? Object.keys(x.regrowth_progress).length + " days" : "-"}`);
      console.log(`    has aftercare_progress:     ${x.aftercare_progress ? Object.keys(x.aftercare_progress).length + " days" : "-"}`);
      console.log(`    is_deleted:                 ${x.is_deleted ?? "-"}`);
    }

    if (authUid) {
      const sub: any = await rc(authUid);
      if (!sub.error) {
        const ents = sub?.subscriber?.entitlements || {};
        const entNames = Object.keys(ents);
        console.log(`\n  RC entitlements: ${entNames.length === 0 ? "(none)" : entNames.map(n => {
          const e = ents[n];
          const active = new Date(e.expires_date).getTime() > Date.now();
          return `${n}(${active ? "ACTIVE" : "EXPIRED"}, exp ${new Date(e.expires_date).toISOString().slice(0,10)})`;
        }).join(", ")}`);
      } else {
        console.log(`\n  RC: ${sub.error}`);
      }
    }
  }
})();
