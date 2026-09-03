/** Look at what a FreeV2 paid user's progress map actually contains, so we can find timestamp fields. */
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const emails = [
    "tharun272@gmail.com",
    "rphartmann@gmail.com",
    "manojprapagar24@gmail.com",
    "chr.n.szil@gmail.com",
  ];
  for (const em of emails) {
    const s = await db.collection("Users").where("email", "==", em).limit(1).get();
    if (s.empty) { console.log(`\n[${em}] NOT FOUND`); continue; }
    const d = s.docs[0].data() as any;
    console.log(`\n=== ${em} ===`);
    console.log(`  user_type=${d.user_type} treatment_stage=${d.treatment_stage} gender=${d.selected_gender}`);
    console.log(`  start_date=${JSON.stringify(d.start_date)}`);
    console.log(`  converted_at=${d.converted_at?.toDate?.().toISOString() ?? d.converted_at}`);
    console.log(`  paid_at=${d.paid_at?.toDate?.().toISOString() ?? d.paid_at}`);
    const p = d.progress ?? {};
    const dayKeys = Object.keys(p).filter(k => k.startsWith("day")).sort((a,b)=>parseInt(a.slice(3))-parseInt(b.slice(3)));
    console.log(`  progress day keys (${dayKeys.length}): ${dayKeys.slice(0, 6).join(", ")} ... ${dayKeys.slice(-4).join(", ")}`);
    // Dump the last 2 dayN entries so we can see what fields sit inside.
    for (const k of dayKeys.slice(-2)) {
      console.log(`\n  progress.${k}:`);
      console.log("  " + JSON.stringify(p[k], null, 2).replace(/\n/g, "\n  "));
    }
    // Also check for other progress-adjacent time fields on the user doc
    const timeFields = Object.keys(d).filter(k => /_at$|reported|last|updated|day/i.test(k)).slice(0, 30);
    console.log(`\n  user-doc timestamp-ish fields: ${timeFields.join(", ")}`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
