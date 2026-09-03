// Patch Aadi's test-account gender + fix timezone so the mobile dashboard
// loads today's routine. One-off — real fix goes into the payment flow.
//
// Usage: npx tsx scripts/_patch_aaprpa999_test.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();

const EMAIL = "aaprpa999@gmail.com";
const GENDER = "male";
const TZ = "America/New_York";
const TZ_OFFSET_MINS = -240; // EDT

function buildStartDate(
  now: Date,
  timezone: string,
  offsetInMins: number,
): { date: string; time: string; timezone: string; timeZoneOffsetInMins: number } {
  const date = now.toLocaleDateString("en-GB", { timeZone: timezone });
  const time = now
    .toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
  return { date, time, timezone, timeZoneOffsetInMins: offsetInMins };
}

async function main() {
  const user = await auth.getUserByEmail(EMAIL);
  console.log("uid:", user.uid);

  const ref = db.collection("Users").doc(user.uid);
  await ref.set(
    {
      selected_gender: GENDER,
      userLocalTimeZone: TZ,
      start_date: buildStartDate(new Date(), TZ, TZ_OFFSET_MINS),
      modified_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  const snap = await ref.get();
  const d = snap.data() ?? {};
  console.log("patched. selected_gender:", d.selected_gender);
  console.log("start_date:", JSON.stringify(d.start_date));
  console.log("userLocalTimeZone:", d.userLocalTimeZone);
  console.log("\n→ Force-close the mobile app and reopen to reload the routine.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
