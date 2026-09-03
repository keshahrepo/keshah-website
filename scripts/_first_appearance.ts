import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  for (const col of ['FREEV2_MEN_STOPPAGE_EXERCISES', 'FREEV2_WOMEN_STOPPAGE_EXERCISES']) {
    console.log(`\n══ ${col} — first appearance by day ══`);
    const snap = await db.collection(col).get();
    const days: Array<{ day: number; ids: string[] }> = [];
    for (const doc of snap.docs) {
      const m = doc.id.match(/^Day(\d+)$/);
      if (!m) continue;
      const day = Number(m[1]);
      const exs = ((doc.data() as any).exercises || []) as Array<{ exerciseId?: string }>;
      const ids = exs.map(e => e.exerciseId || '').filter(Boolean);
      days.push({ day, ids });
    }
    days.sort((a, b) => a.day - b.day);
    const firstSeen: Record<string, number> = {};
    for (const d of days) {
      for (const id of d.ids) {
        if (!(id in firstSeen)) firstSeen[id] = d.day;
      }
    }
    const entries = Object.entries(firstSeen).sort((a, b) => a[1] - b[1]);
    for (const [id, day] of entries) {
      console.log(`  Day ${String(day).padStart(2)}  ${id}`);
    }
    console.log(`\n  ${entries.length} distinct exercises total across ${days.length} days.`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
