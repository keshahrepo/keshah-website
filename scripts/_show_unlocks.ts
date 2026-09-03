import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  for (const docId of ['exercises_unlocks_free_stoppage', 'exercises_unlocks']) {
    console.log(`\n══ Settings/${docId} ══`);
    const snap = await db.collection('Settings').doc(docId).get();
    if (!snap.exists) { console.log('  (missing)'); continue; }
    const d = snap.data() as any;
    for (const g of ['men', 'women']) {
      const items = (d[g] || []) as any[];
      console.log(`\n  ${g}: ${items.length} entries`);
      const sorted = [...items].sort((a, b) => (a.days ?? -1) - (b.days ?? -1));
      for (const item of sorted) {
        const day = item.days === null || item.days === undefined ? 'unlocked' : `Day ${item.days}`;
        console.log(`    ${day.padStart(10)} ${item.advanced ? '[adv]' : '     '} ${item.title}`);
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
