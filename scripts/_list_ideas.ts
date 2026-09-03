import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const snap = await db.collection('Ideas').get();
  const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  rows.sort((a: any, b: any) => (a.id || '').localeCompare(b.id || ''));
  for (const r of rows as any[]) {
    console.log(`${r.id.padEnd(6)} [${(r.status||'').padEnd(10)}] ${r.title || ''}`);
    if (r.description) console.log('       ', String(r.description).slice(0, 240).replace(/\n/g, ' '));
    if (r.assigned_version) console.log('        version:', r.assigned_version);
    if (r.target_metric) console.log('        metric:', r.target_metric);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
