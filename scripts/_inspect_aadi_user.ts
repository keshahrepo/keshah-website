import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();

const UID = "fJW8majj8Rgl69z2CTtjb0OzVrn1";
const EMAIL = "aaditya.agrawal36@gmail.com";

async function main() {
  console.log("=== Firebase Auth user ===");
  try {
    const user = await auth.getUser(UID);
    console.log(`uid: ${user.uid}`);
    console.log(`email: ${user.email}`);
    console.log(`emailVerified: ${user.emailVerified}`);
    console.log(`disabled: ${user.disabled}`);
    console.log(`created: ${user.metadata.creationTime}`);
    console.log(`providers:`);
    user.providerData.forEach((p) =>
      console.log(`  - ${p.providerId}: ${p.email ?? "(no email)"} uid=${p.uid}`),
    );
  } catch (e) {
    console.log("  ✗", e);
  }

  console.log("\n=== Firestore Users/" + UID + " ===");
  const doc = await db.collection("Users").doc(UID).get();
  if (!doc.exists) {
    console.log("  ✗ MISSING");
  } else {
    const data = doc.data() ?? {};
    console.log(`  keys (${Object.keys(data).length}):`, Object.keys(data).sort());
    console.log("\n  Full doc:");
    console.log(JSON.stringify(data, null, 2).slice(0, 4000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
