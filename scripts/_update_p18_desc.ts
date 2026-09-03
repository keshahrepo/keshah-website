import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  await db.collection('Ideas').doc('p18').update({
    title: 'Scalp check-in v2 — slider + Your Answers card + auto STOP+ escalation',
    eli5: 'Replace yes/no/not-sure radios on Day 3/6/13 with the 5-point slider from Day 0 baseline. Result branches on numerical comparison (today < day0 = looser). Card shows Starting point / Today with descriptive labels, plus a "What we\'re doing" intervention row on no-change. Day 13 no-change auto-switches user to STOP+.',
    description: `3-step flow across Day 3, Day 6, Day 13:
  Step 1: cinematic "Let's check your scalp."
  Step 2: calibrate — side-pinch instruction + illustration + "I pinched" gate
  Step 3: rate — top-pinch illustration + slider (starts at center, colored per-rating thumb with glow, animated fill, discrete dots, "Like sides" / "Stuck" endpoints, no numeric 1..5 row)
  Step 4: result — static "Your answers" card with 2-3 beat reveal animation:
    - Card + Starting point row fades in (250ms delay + 500ms)
    - Today row fades in (400ms)
    - Intervention row fades in — ONLY on no-change (500ms)
    - TypingReveal prose animates in after the card completes
    - Primary button fades + slides in after prose finishes typing

Two outcomes only:
  Looser (today rating < day0): "You're loosening" celebration copy, no intervention row
  No change (today rating >= day0): "What we're doing" row + intervention copy per day
    - Day 3: "Push harder next session" (user action)
    - Day 6: "Adding Neck Presses tomorrow" (stubborn_scalp injection)
    - Day 13: "Switching you to Stop+ tomorrow" (treatment_stage = FREE_STOPPAGE_PLUS)

Day 13 no-change gets Skip for now secondary CTA so STOP+ isn't forced.

Data model:
  Read: scalp_tension_baseline (from Day 0 baseline widget)
  Write: scalp_check_readings array [{day, rating, at}] on User doc
  Legacy scalp_check_answers.{day} = "yes"/"no" kept for one release

Files touched:
  - lib/screens/dashboard/pages/scalp_check_in_page.dart (major rewrite)
  - lib/widget/scalp_tension_slider.dart (extracted from baseline, restyled)
  - lib/screens/dashboard/dashboard_screen.dart (trigger update + QA menu floater)
  - lib/core/app_consts.dart (scalpCheckReadingsFieldKey)
  - Day 0 baseline updated to import shared slider`,
    updated_at: FieldValue.serverTimestamp(),
  });
  console.log('p18 desc updated');
}
main().catch(e => { console.error(e); process.exit(1); });
