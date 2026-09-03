import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const now = FieldValue.serverTimestamp();
  await db.collection('Ideas').doc('p19').set({
    title: 'Dashboard journey card — time-based Start / Today / Target date',
    eli5: 'Ambient always-visible progress card at top of the FreeV2 stoppage dashboard. Horizontal Start → Now → Goal line with Day 0, current day, and target date (start + 60). Now dot position driven by days elapsed, not by scalp rating.',
    description: `Extract the animated Start/Now/Goal timeline out of the Day 3/6/13 check-in result page (where it stopped fitting — check-in results now use a static "Your answers" box instead) and give it a natural home on the dashboard as an ambient journey card.

Position: top of dashboard, above the day's routine tasks.
Visibility: FreeV2 stoppage users only. Hidden for regrowth (their journey is different) and free_maintenance (60-day arc complete). VIP unaffected.
Animation: Now dot animates to today's position on dashboard mount (~800ms easeOutCubic). No repeated pulse — this is ambient, not a moment.
Labels: "Day 0" (left) / "Day X" (middle, current day) / e.g. "Nov 1" (right, start_date + 60 days).

Files:
  - NEW: lib/widget/scalp_journey_card.dart
  - EDIT: lib/screens/dashboard/dashboard_screen.dart (insert card at top of the FreeV2 dashboard column)`,
    status: 'building',
    target_metric: 'retention_d14',
    assigned_version: '5_18_next',
    shipped_at: null,
    actual_delta_pp: null,
    original_proposal_number: 19,
    parked_reason: null,
    parked_unpark_trigger: null,
    ship_cluster: 'Progress ambient',
    dependencies: ['p18'],
    created_at: now,
    updated_at: now,
  });
  console.log('p19 created (building)');
}
main().catch(e => { console.error(e); process.exit(1); });
