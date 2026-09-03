import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const now = FieldValue.serverTimestamp();
  await db.collection('Ideas').doc('p17').set({
    title: "Hard-gate technique-unlock celebration off Day 1",
    eli5: "Belt-and-suspenders: the Day-1 flow (streak → techniques preview → alarm walkthrough) already covers the initial technique reveal. Add an explicit `userDay <= 1 return` guard on the dashboard's celebration screen so no future preview-data change can accidentally re-introduce the duplicate.",
    description: `The dashboard-entry celebration (main_screen_wrapper.dart _checkTechniqueUnlockCelebration) fires when an exercise has days == userDay - 1. Under the current preview data (p6), Scalp Pressing + Pinching are days:null, so Day 1 currently produces no matches. But if anyone in the future adds a days:0 entry to the exercises_unlocks_free_stoppage doc, the celebration would fire again on Day 1 and stack on top of the Day-1 flow.

Fix: explicit userDay <= 1 return at the top of _checkTechniqueUnlockCelebration. Celebrations continue firing Day 2 onwards (Day 2 Stretches, Day 5 Sliding, Day 10 Accupressure, Day 15 Neck Presses, Day 25 Neck Stretches) — same as before.`,
    status: 'building',
    target_metric: 'perday_day2',
    assigned_version: '5_18_next',
    shipped_at: null,
    actual_delta_pp: null,
    original_proposal_number: 17,
    parked_reason: null,
    parked_unpark_trigger: null,
    ship_cluster: 'Day 1 activation',
    dependencies: ['p6', 'p9'],
    created_at: now,
    updated_at: now,
  });
  console.log('p17 created (building)');
}
main().catch(e => { console.error(e); process.exit(1); });
