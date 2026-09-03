import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  await db.collection('Ideas').doc('p9').update({
    description: `Move AlarmWalkthroughScreen from starter_photos_page.dart's post-completion hop to the Day-1 post-routine sequence: streak → techniques unlock preview → alarm walkthrough (iOS only) → dashboard.

Streak page copy stays as-is ("Day complete." / "Consistency is everything.") — Aadi decided not to differentiate Day 1 header.

Reminder-time picker in onboarding stays put (this is only about the alarm walkthrough moving).

Splash backfill + profile re-run entry points unchanged (safety nets for anyone who bailed on Day 1).`,
    updated_at: FieldValue.serverTimestamp(),
  });
  console.log('p9 desc updated');
}
main().catch(e => { console.error(e); process.exit(1); });
