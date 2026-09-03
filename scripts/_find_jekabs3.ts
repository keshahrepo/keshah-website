import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  // Try wp_user.email
  const wp = await db.collection("Users").where("wp_user.email", "==", "jekabs.vancans@inbox.lv").limit(3).get();
  console.log(`wp_user.email match: ${wp.size}`);
  for (const d of wp.docs) console.log("  UID:", d.id, "email:", d.data().email, "name:", d.data().wp_user?.displayName);

  // Search delivery_address by name prefix (case-insensitive attempt via multi-fetch)
  const snap = await db.collection("Users")
    .where("regrowth_treatment_purchased", "==", true)
    .limit(500)
    .get();
  console.log(`\nRegrowth-purchased scan: ${snap.size} users`);
  for (const d of snap.docs) {
    const data = d.data();
    const addr = data.delivery_address as any;
    const name = (data.wp_user?.displayName || "").toString().toLowerCase();
    const emailField = (data.email || "").toString().toLowerCase();
    const addrName = (addr?.name || addr?.receiverName || "").toString().toLowerCase();
    if (
      name.includes("jekabs") || name.includes("vancans") ||
      emailField.includes("jekabs") || emailField.includes("vancans") ||
      addrName.includes("jekabs") || addrName.includes("vancans")
    ) {
      console.log(`  ✓ UID ${d.id}: email=${data.email} name=${data.wp_user?.displayName} addr=${JSON.stringify(addr)}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
