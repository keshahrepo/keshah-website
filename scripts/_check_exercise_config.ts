import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const snap = await db.doc("Settings/app_general_settings").get();
  const d = snap.data();
  console.log("exercises_config:", JSON.stringify(d?.exercises_config, null, 2));
  // Also count docs in Exercise_List collection (VIP source)
  const el = await db.collection("Exercise_List").get();
  console.log(`\nExercise_List collection has ${el.size} day docs`);
  const days = el.docs.map((d) => d.id).sort((a, b) => {
    const na = parseInt(a.replace("Day", ""), 10);
    const nb = parseInt(b.replace("Day", ""), 10);
    return na - nb;
  });
  console.log("First 5:", days.slice(0, 5).join(", "));
  console.log("Last 5:", days.slice(-5).join(", "));
}
main().catch(e => { console.error(e); process.exit(1); });
