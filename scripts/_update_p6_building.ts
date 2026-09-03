import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  await db.collection('Ideas').doc('p6').update({
    status: 'building',
    assigned_version: '5_18_next',
    description: `Two-part fix:
Part A (mobile) — replace hardcoded "UNLOCKS TOMORROW" in new_streak_update_page.dart with accurate copy ("UNLOCKS TOMORROW" only when next unlock is userDay+1, otherwise "UNLOCKS DAY N" or "UNLOCKS IN X DAYS").
Part B (Firestore) — rewrite FREEV2_MEN/WOMEN_STOPPAGE_EXERCISES + STOP+ + Settings/exercises_unlocks_free_stoppage so techniques introduce on Day 1 (Pressing + Pinching), 2 (Stretches), 5 (Sliding), 10 (Accupressure), 15 (Neck Presses), 25 (Neck Stretches). Kills the 11-day + 14-day dead zones. Days 25-60 keep the full 7-technique rotation.`,
    updated_at: FieldValue.serverTimestamp(),
  });
  console.log('p6 → building');
}
main().catch(e => { console.error(e); process.exit(1); });
