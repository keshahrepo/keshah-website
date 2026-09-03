import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  await db.collection('Ideas').doc('p9').update({
    status: 'building',
    assigned_version: '5_18_next',
    description: `Two mobile changes bundled:
1. Streak page (new_streak_update_page.dart) — when userDay == 1, swap "Day complete." → "Day 1 of 7 done." and subhead → "6 days left in your trial. Same time tomorrow?". Days 2+ unchanged.
2. Move AlarmWalkthroughScreen from starter_photos_page.dart's post-completion hop to the Day-1 post-routine sequence: streak → techniques unlock preview → alarm walkthrough (iOS only) → dashboard. Splash backfill + profile re-run unchanged (safety nets).
Reminder-time picker in onboarding stays put — this is only about the alarm walkthrough moving.`,
    updated_at: FieldValue.serverTimestamp(),
  });
  console.log('p9 → building');
}
main().catch(e => { console.error(e); process.exit(1); });
