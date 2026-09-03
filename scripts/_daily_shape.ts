import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const snap = await db.collection('FREEV2_MEN_STOPPAGE_EXERCISES').get();
  const rows: any[] = [];
  for (const doc of snap.docs) {
    const m = doc.id.match(/^Day(\d+)$/); if (!m) continue;
    const day = Number(m[1]);
    const exs = ((doc.data() as any).exercises || []) as Array<{ exerciseId?: string; duration?: number }>;
    rows.push({ day, exs });
  }
  rows.sort((a, b) => a.day - b.day);
  for (const r of rows) {
    const total = r.exs.reduce((s: number, e: any) => s + (e.duration ?? 0), 0);
    const names = r.exs.map((e: any) => `${e.exerciseId}@${e.duration}`).join(', ');
    console.log(`Day ${String(r.day).padStart(2)}  ${String(r.exs.length)}ex  ${String(total).padStart(2)}min  ${names}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
