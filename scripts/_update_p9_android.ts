import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  await db.collection('Ideas').doc('p9').update({
    description: `Move AlarmWalkthroughScreen from starter_photos_page.dart's post-completion hop to the Day-1 post-routine sequence: streak → techniques unlock preview → alarm walkthrough → dashboard.

Now ships on iOS AND Android (added 4 Android Clock screenshots to assets/png/alarm_walkthrough/android/; per-platform copy in _stepPages()).

Skip on the walkthrough intro now shows a WeeklyProgressCheckDialog "Are you sure?" confirm with an alarm-value pitch — same native-dialog pattern as onboarding_call_prompt / sign-out / delete-account. Primary "Set it up", secondary "Skip anyway".

Streak page copy unchanged. Reminder-time picker in onboarding stays put.
Splash backfill + profile re-run entry points both dropped their iOS gate — Android users get them too now.`,
    updated_at: FieldValue.serverTimestamp(),
  });
  console.log('p9 desc updated');
}
main().catch(e => { console.error(e); process.exit(1); });
