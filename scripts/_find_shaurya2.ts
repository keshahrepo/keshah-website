import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  console.log("=== 1. All emails matching 'shaurya' anywhere (case-insensitive scan of last 24h signups) ===");
  const since = Timestamp.fromMillis(Date.now() - 48 * 3600 * 1000);
  const recent = await db.collection("Users").where("created_at", ">=", since).get();
  console.log("recent 48h signups:", recent.size);
  for (const d of recent.docs) {
    const u:any = d.data();
    const email = (u.email ?? "").toString().toLowerCase();
    const dn = (u.wp_user?.display_name ?? "").toString().toLowerCase();
    if (email.includes("shaurya") || email.includes("grover") || dn.includes("shaurya") || dn.includes("grover")) {
      console.log(" ", d.id, "·", u.email, "· display:", u.wp_user?.display_name, "· created:", u.created_at?.toDate?.()?.toISOString());
    }
  }
  console.log("\n=== 2. Direct lookup by uid variants (if you know it) — skipping ===");
})();
