import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  // Pull anyone with strong paid signals across the full Users
  // collection. Will be slow but tells us if Firestore has paid info.
  console.log("Querying paid indicators across all Users...");
  const proSnap = await db.collection("Users").where("pro", "==", true).get();
  console.log(`  pro===true: ${proSnap.size}`);

  // razorpay subs
  const rzpSnap = await db.collection("Users")
    .where("razorpay_subscription_id", "!=", null).get().catch(()=>({size:0,docs:[]}));
  console.log(`  razorpay_subscription_id set: ${rzpSnap.size}`);

  // Check what collections exist that might log purchases
  const colls = await db.listCollections();
  console.log(`\nCollections in Firestore:`);
  for (const c of colls) console.log(`  ${c.id}`);
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
