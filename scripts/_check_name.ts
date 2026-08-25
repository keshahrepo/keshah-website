import { getFirebaseAdmin } from "../lib/firebase-admin";
async function main() {
  const { db } = getFirebaseAdmin();
  const s = await db.collection("Users").where("email", "==", "karadom562@gmail.com").limit(1).get();
  const d = s.docs[0].data();
  console.log("wp_user:", JSON.stringify(d.wp_user, null, 2));
}
main();
