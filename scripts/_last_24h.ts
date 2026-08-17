import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
  const snap = await db.collection("Users").where("created_at", ">=", cutoff).get();
  console.log(`Total new signups (last 24h): ${snap.size}`);

  let male = 0, female = 0, unknownGender = 0;
  let paidV2 = 0, freeV2 = 0;
  const purchasers: any[] = [];
  for (const d of snap.docs) {
    const u: any = d.data();
    const gender = u.selected_gender;
    if (gender === 'male') male++;
    else if (gender === 'female') female++;
    else unknownGender++;
    if (u.user_type === 'freev2') {
      if (u.pro === true || (u.purchase_types && Object.keys(u.purchase_types).length > 0)) {
        paidV2++;
        purchasers.push({
          email: u.email,
          uid: d.id,
          gender,
          plan: u.plan,
          referral: u.referral_source,
          createdAt: u.created_at?.toDate?.()?.toISOString(),
        });
      } else {
        freeV2++;
      }
    }
  }
  console.log(`\nBy gender: male=${male} · female=${female} · unset=${unknownGender}`);
  console.log(`FreeV2 paid=${paidV2} · FreeV2 unpaid=${freeV2}`);

  if (purchasers.length) {
    console.log("\nPurchasers:");
    for (const p of purchasers) console.log("  ", JSON.stringify(p));
  } else {
    console.log("\nNo purchasers found in new signups (last 24h).");
  }

  // Also check ALL users with `referral_source` containing creator names
  // to see if anyone selected the new referral options (proxies who came
  // from /f/jennifer + creator funnels — though these are usually the
  // quiz funnel not the /women landing).
  const allRefs = await db.collection("Users").where("created_at", ">=", cutoff).get();
  const refCounts: Record<string, number> = {};
  for (const d of allRefs.docs) {
    const r = (d.data() as any).referral_source;
    if (r) refCounts[r] = (refCounts[r] || 0) + 1;
  }
  console.log("\nReferral source picks (last 24h):");
  for (const [k, v] of Object.entries(refCounts)) console.log(`  ${k}: ${v}`);
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
