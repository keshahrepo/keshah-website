import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const ids = ['scalp_pressing_01', 'scalp_pinching_02', 'scalp_stretches_03', 'scalp_sliding_06',
               'scalp_accupressure_04', 'neck_presses_05', 'neck_stretches_07', 'science_of_hair_loss_00'];
  for (const col of ['FREEV2_MEN_STOPPAGE_EXERCISES_MODEL', 'FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL']) {
    console.log(`\n${col}:`);
    for (const id of ids) {
      const s = await db.collection(col).doc(id).get();
      console.log(`  ${id.padEnd(30)} ${s.exists ? '✓' : '✗ MISSING'}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
