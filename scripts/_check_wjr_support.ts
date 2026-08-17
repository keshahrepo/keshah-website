import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "2KS4YWgW2LNS8DD5oNcMd1vMePA3";
(async () => {
  console.log("=== Top-level collections ===");
  const cols = await db.listCollections();
  console.log(cols.map(c => c.id).join(", "));
  console.log("");

  // Check possible support locations
  console.log("=== support/{uid}/messages (any field shape) ===");
  const m1 = await db.collection("support").doc(UID).collection("messages").limit(5).get();
  console.log("count:", m1.size);
  m1.docs.forEach(d => console.log(JSON.stringify(d.data()).slice(0, 400)));

  console.log("");
  console.log("=== support/{uid} doc ===");
  const sDoc = await db.collection("support").doc(UID).get();
  console.log("exists:", sDoc.exists);
  if (sDoc.exists) console.log(JSON.stringify(sDoc.data()).slice(0, 500));

  // List subcollections under Users/{uid}
  console.log("");
  console.log("=== Users/{uid} subcollections ===");
  const userSubcols = await db.collection("Users").doc(UID).listCollections();
  console.log(userSubcols.map(c => c.id).join(", "));
  for (const sub of userSubcols) {
    const items = await sub.limit(3).get();
    console.log(`  [${sub.id}] count: ${items.size}`);
    items.docs.forEach(x => console.log(`    ${x.id}: ${JSON.stringify(x.data()).slice(0, 300)}`));
  }

  // Also check the support collection's docs sorted by latest
  console.log("");
  console.log("=== support/ docs query by senderId ===");
  // Some apps store sender_id at the top doc level; try
  const sortedSnap = await db.collection("support").doc(UID).get();
  if (sortedSnap.exists) console.log("user doc in support:", JSON.stringify(sortedSnap.data()));

  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
