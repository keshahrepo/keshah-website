import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const now = FieldValue.serverTimestamp();
  await db.collection('Ideas').doc('p18').set({
    title: 'Scalp check-in v2 — slider + timeline result + auto STOP+ escalation',
    eli5: 'Replace yes/no/not-sure radios on Day 3/6/13 with the same 5-point slider from Day 0 baseline. Result branches on numerical comparison (today < day0 = looser), shows a 3-dot Start/Now/Goal timeline. Day 13 no-change auto-switches user to STOP+ (5 exercises/day, more intensive).',
    description: `Same 4-step structure across Day 3, Day 6, Day 13:
  Step 1: cinematic "Let's check your scalp."
  Step 2: pinch instruction ("same spot as Day 0, same way, hold a few seconds")
  Step 3: 5-point slider identical to Day 0 baseline, starts unset
  Step 4: timeline result (Start / Now / Goal), branches on today vs day0 comparison

Two outcomes only:
  Looser (today rating < day0): "You're loosening" + [X]% progress + target-date beat
  No change (today rating >= day0): treated neutral, never red

No-change escalation stair-step:
  Day 3: "That's normal. Try more force. Check back in 3 days."
  Day 6: "Neck presses moved up to tomorrow" (existing stubborn_scalp injection)
  Day 13: NEW — "Let's step this up with Stop+" → auto-switch treatment_stage: FREE_STOPPAGE_PLUS on tap. "Skip for now" secondary CTA.

Data model:
  Read: scalp_tension_baseline (already stored from Day 0 baseline widget)
  Write: scalp_check_readings: [{ day, rating, at }] on User doc
  Existing scalp_check_answers.{day} kept for one release for backward compat

Files touched:
  - lib/widget/scalp_tension_slider.dart (NEW — extracted from baseline)
  - lib/widget/scalp_progress_timeline.dart (NEW)
  - lib/screens/dashboard/pages/scalp_check_in_page.dart (rewrite)
  - lib/screens/dashboard/dashboard_screen.dart (trigger update — pass day0, receive rating)
  - lib/core/app_consts.dart (scalpCheckReadingsFieldName constant)`,
    status: 'building',
    target_metric: 'outcome_converted',
    assigned_version: '5_18_next',
    shipped_at: null,
    actual_delta_pp: null,
    original_proposal_number: 18,
    parked_reason: null,
    parked_unpark_trigger: null,
    ship_cluster: 'Check-in loop',
    dependencies: ['p15'],
    created_at: now,
    updated_at: now,
  });
  console.log('p18 created (building)');
}
main().catch(e => { console.error(e); process.exit(1); });
