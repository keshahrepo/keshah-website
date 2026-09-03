import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  await db.collection('Ideas').doc('p19').update({
    status: 'parked',
    assigned_version: null,
    parked_reason: 'Built the ambient journey card + started on a matching 7-day trial card. Aadi pulled both from the dashboard for now — wants to see the check-in "Your answers" card in production first before adding ambient progress affordances at the top of the dashboard. Widget code lived at lib/widget/scalp_journey_card.dart (deleted); trial-card design was Option B (7-dot progress line + urgency copy). Recreate from git history when unparked.',
    parked_unpark_trigger: 'After p18 lands + we have data on whether users actually engage with the check-in comparison. If retention holds, add ambient progress cards then.',
    updated_at: FieldValue.serverTimestamp(),
  });
  console.log('p19 parked');
}
main().catch(e => { console.error(e); process.exit(1); });
