// Pull all contact fields for Sadiq Hussain (SaadSsih reviewer).
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

const UID = "7brsb94d4UTAUkXxQU4GtTwvnxU2";

(async () => {
  const doc = await db.collection("Users").doc(UID).get();
  const x = doc.data() as any;
  console.log("Firestore user doc — contact-related fields:\n");
  for (const [k, v] of Object.entries(x).sort()) {
    if (/phone|mobile|contact|whatsapp|sms|number|country|region|locale/i.test(k)) {
      console.log(`  ${k.padEnd(38)} ${JSON.stringify(v)}`);
    }
  }
  console.log("\nFirebase Auth record:");
  try {
    const a = await auth.getUser(UID);
    console.log(`  uid:         ${a.uid}`);
    console.log(`  email:       ${a.email || "-"}`);
    console.log(`  phoneNumber: ${a.phoneNumber || "-"}`);
    console.log(`  displayName: ${a.displayName || "-"}`);
    console.log(`  providers:   ${a.providerData.map(p => `${p.providerId}:${p.uid}`).join(", ")}`);
  } catch (e: any) { console.log(`  ${e.message}`); }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
