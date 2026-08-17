// Search all PAID (pro==true) users on APPLE for any Saad/Sadi/Sadesh variant.
// Signal: reviewer said "annual subscription" so must be pro==true.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const needles = [
    "saad", "sadi", "sadh", "sadesh", "sadeesh", "sadeeq",
    "sassi", "sadiq", "sadis", "saddis", "sass",
  ];

  console.log("Querying pro==true users…");
  const proSnap = await db.collection("Users").where("pro", "==", true).get();
  console.log(`  pro users: ${proSnap.size}`);

  const hits: any[] = [];
  for (const doc of proSnap.docs) {
    const x = doc.data() as any;
    const email = ((x.email as string) || "").toLowerCase();
    const first = ((x.first_name as string) || "").toLowerCase();
    const last = ((x.last_name as string) || "").toLowerCase();
    const wpName = ((x.wp_user?.display_name as string) || "").toLowerCase();
    const hay = [email, first, last, wpName].join(" ");
    const hit = needles.find((n) => hay.includes(n));
    if (hit) {
      const isApple = email.includes("privaterelay") || x.providerId === "apple.com" || /apple/i.test(x.payment_provider || "");
      hits.push({
        uid: doc.id,
        email: x.email,
        name: [x.first_name, x.last_name].filter(Boolean).join(" ") || x.wp_user?.display_name || "-",
        stage: x.treatment_stage,
        pro: x.pro,
        provider: x.payment_provider || x.providerId || "-",
        paid_at: x.paid_at?.toDate?.()?.toISOString?.().split("T")[0] || "-",
        regrowth: !!x.regrowth_treatment_purchased || !!x.regrowth_kit_purchased || (x.treatment_stage || "").includes("REGROWTH"),
        isApple,
        needle: hit,
      });
    }
  }

  hits.sort((a, b) => (b.paid_at || "").localeCompare(a.paid_at || ""));
  console.log(`\n${hits.length} PRO users match Saad/Sadi/Sadesh variants:\n`);
  for (const h of hits) {
    const apple = h.isApple ? "🍎" : "  ";
    console.log(`  ${apple} [${h.needle.padEnd(7)}] ${h.email.padEnd(40)} ${h.name.padEnd(22)} paid=${h.paid_at} regrowth=${h.regrowth ? "Y" : "-"} prov=${h.provider} uid=${h.uid}`);
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
