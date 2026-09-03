import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const now = FieldValue.serverTimestamp();
  await db.collection('Ideas').doc('p16').set({
    title: 'Consolidate FreeV2 photo asks — kill Day 1 duplicate',
    eli5: 'FreeV2 users on Day 1 were getting a progress-photo prompt AND a starter-photos prompt on Day 2 — two flows asking essentially for the same baseline photos. Kill the Day 1 one; keep Day 2 starter photos (which is already skippable).',
    description: `Two photo systems were double-dipping on FreeV2 stoppage:
- dashboard_bloc.dart checkIfUserSubmittedPhotosForToday auto-pushed TakePhotoProgressPage(day: 1) 3 seconds after Day 1 dashboard init
- dashboard_screen.dart _maybeShowStarterPhotos then auto-pushed the 4-photo baseline on Day 2+

Fix: gate the bloc method to fire ONLY on regrowth phase (where the every-15-days progress-photo cadence is the point). Stoppage users get the Day-2 starter-photos ask as their only photo prompt during trial, and it's already skippable via "Skip for now" (starter_photos_page.dart:348).`,
    status: 'building',
    target_metric: 'perday_day1',
    assigned_version: '5_18_next',
    shipped_at: null,
    actual_delta_pp: null,
    original_proposal_number: 16,
    parked_reason: null,
    parked_unpark_trigger: null,
    ship_cluster: 'Day 1 activation',
    dependencies: [],
    created_at: now,
    updated_at: now,
  });
  console.log('p16 created (building)');
}
main().catch(e => { console.error(e); process.exit(1); });
