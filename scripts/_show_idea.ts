import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const id = process.argv[2];
  if (!id) { console.error('Usage: tsx scripts/_show_idea.ts <id>'); process.exit(1); }
  const snap = await db.collection('Ideas').doc(id).get();
  if (!snap.exists) { console.error('Not found:', id); process.exit(1); }
  const d = snap.data() as any;
  console.log('id:', id);
  console.log('title:', d.title);
  console.log('status:', d.status);
  console.log('target_metric:', d.target_metric);
  console.log('assigned_version:', d.assigned_version);
  console.log('---');
  console.log(d.description || '(no description)');
  console.log('---');
  console.log('raw:', JSON.stringify(d, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
