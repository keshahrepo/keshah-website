// Look for any Firebase user created in the last 30 min with apple.com
// provider. Handles the "Hide My Email" relay case where the user's real
// email isn't what shows up in Firebase.
//
// Usage: npx tsx scripts/_check_recent_apple_signins.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth, UserRecord } from "firebase-admin/auth";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();

async function main() {
  const cutoffMs = Date.now() - 30 * 60 * 1000;
  console.log(
    `\nScanning Firebase users created after ${new Date(cutoffMs).toISOString()}\n`,
  );

  const recent: UserRecord[] = [];
  let nextPageToken: string | undefined;
  do {
    const res = await auth.listUsers(1000, nextPageToken);
    for (const u of res.users) {
      const created = Date.parse(u.metadata.creationTime);
      if (created >= cutoffMs) recent.push(u);
    }
    nextPageToken = res.pageToken;
  } while (nextPageToken);

  console.log(`Found ${recent.length} users created in the last 30 min:`);
  recent.sort(
    (a, b) => Date.parse(a.metadata.creationTime) - Date.parse(b.metadata.creationTime),
  );

  for (const u of recent) {
    console.log(`\n  uid: ${u.uid}`);
    console.log(`    created: ${u.metadata.creationTime}`);
    console.log(`    email: ${u.email ?? "(none)"}`);
    console.log(`    display: ${u.displayName ?? "(none)"}`);
    console.log(
      `    providers: ${u.providerData.map((p) => `${p.providerId}(${p.email ?? p.uid})`).join(", ")}`,
    );

    const doc = await db.collection("Users").doc(u.uid).get();
    if (doc.exists) {
      const d = doc.data() ?? {};
      console.log(
        `    Firestore: user_type=${d.user_type} tags=${JSON.stringify(d.extra_user_tags)} paid_at=${d.paid_at?.toDate?.() ?? "(no)"}`,
      );
    } else {
      console.log(`    Firestore: MISSING`);
    }
  }

  console.log(
    `\n\nAlso scanning PaidWebSessions created in the last 30 min...\n`,
  );
  const cutoff = new Date(cutoffMs);
  const pws = await db
    .collection("PaidWebSessions")
    .where("created_at", ">=", cutoff)
    .get();
  console.log(`Found ${pws.size} PaidWebSessions:`);
  pws.forEach((d) => {
    const data = d.data();
    console.log(`  ${d.id}`);
    console.log(`    email: ${data.email}`);
    console.log(`    sub: ${data.subscription_id}`);
    console.log(`    claimed_by_uid: ${data.claimed_by_uid ?? "(unclaimed)"}`);
    console.log(`    rc_receipt_ok: ${data.rc_receipt_ok}`);
    console.log(`    claimed_at: ${data.claimed_at?.toDate?.() ?? "(never)"}`);
  });
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
