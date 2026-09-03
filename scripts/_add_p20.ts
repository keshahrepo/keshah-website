import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const now = FieldValue.serverTimestamp();
  await db.collection('Ideas').doc('p20').set({
    title: 'Scalp check-ins admin dashboard — rating movement + thesis check',
    eli5: 'New /dashboard/scalp-check-ins page. Cards: (1) rating movement per check-in day, (2) headline "% loosening by Day 6", (3) avg rating trend line, (4) thesis check — trial→paid split by looser vs no-change raters. Answers the load-bearing question: does the pinch/rating signal actually correlate with paying?',
    description: `Data comes from p18 writes: scalp_tension_baseline (int 1-5, Day 0) + scalp_check_readings array [{day, rating, at}].

Cards (all filterable by date range + tier):
1. Rating movement (3×3 table) — for each check-in day, split % Looser / No change / Tighter vs Day 0
2. Headline: % loosening by Day 6 — single big number. Load-bearing test of whether the timeline works.
3. Avg rating trend — line from Day 0 → 3 → 6 → 13
4. Thesis check — trial→paid conversion for "looser" raters vs "no change" raters. Tests the belief-instrument hypothesis.
5. Supporting: check-in completion rate per day, stubborn_scalp %, Day 13 Start Stop+ vs Skip tap rate

Rules baked in:
- "Looser" = today's rating < Day 0 baseline (strict inequality)
- Don't blend with legacy scalp_check_answers yes/no/not-sure — different signal
- Segment by tier where the data supports it

Files:
  - NEW: app/dashboard/(main)/scalp-check-ins/page.tsx (client)
  - NEW: app/api/dashboard/scalp-check-ins/route.ts (aggregation)
  - EDIT: app/dashboard/(main)/layout.tsx (nav link)

Note: real data starts flowing once p18 ships to real users. Building the surface now so it's ready for the first cohort.`,
    status: 'building',
    target_metric: 'outcome_converted',
    assigned_version: null,
    shipped_at: null,
    actual_delta_pp: null,
    original_proposal_number: 20,
    parked_reason: null,
    parked_unpark_trigger: null,
    ship_cluster: 'Admin analytics',
    dependencies: ['p18'],
    created_at: now,
    updated_at: now,
  });
  console.log('p20 created (building)');
}
main().catch(e => { console.error(e); process.exit(1); });
