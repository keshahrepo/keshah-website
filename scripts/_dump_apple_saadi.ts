// Dump full docs for a few Apple Saadi users to see all fields (so we can identify paid/regrowth signals)
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UIDS = [
  "x6zrmccrtw@privaterelay.appleid.com",  // Sadiq Hussain
  "twrdd5nb9b@privaterelay.appleid.com",  // Sadeeq Sambo
  "66gccfjtjb@privaterelay.appleid.com",  // Moutaz Sassi
  "fh7f5byp6w@privaterelay.appleid.com",  // Afriyie Sadeeq
  "qm6tr9qrbc@privaterelay.appleid.com",  // Rohith Sadeesh - had FREE_STOPPAGE_EXT — interesting
  "zd5cpg2v52@privaterelay.appleid.com",  // Owais Sadiq
];

(async () => {
  for (const email of UIDS) {
    const snap = await db.collection("Users").where("email", "==", email).get();
    if (snap.empty) { console.log(`\n=== ${email}: NOT FOUND ===`); continue; }
    const x = snap.docs[0].data() as any;
    console.log(`\n=== ${email} ===`);
    console.log(`UID: ${snap.docs[0].id}`);
    console.log(`Name: ${x.first_name} ${x.last_name || ""} (${x.wp_user?.display_name || "-"})`);
    console.log(`Stage: ${x.treatment_stage}`);
    // Print any field that looks paid/sub/regrowth related
    const relevant = Object.entries(x).filter(([k]) =>
      /pro|paid|sub|regrow|converted|entitlement|purchas|rc_|revenu|active|trial|apple|store|receipt/i.test(k)
    );
    for (const [k, v] of relevant) {
      const s = typeof v === "object" && v !== null ? JSON.stringify(v).slice(0, 120) : String(v).slice(0, 120);
      console.log(`  ${k.padEnd(38)} ${s}`);
    }
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
