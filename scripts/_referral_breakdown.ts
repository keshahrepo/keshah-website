import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const days = 20;
  const cutoff = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
  const snap = await db.collection("Users").where("created_at", ">=", cutoff).get();
  console.log(`Total signups (last ${days} days): ${snap.size}\n`);

  type Row = { signups: number; paid: number; female: number; male: number };
  const bySource: Record<string, Row> = {};
  let totalPaid = 0;

  for (const d of snap.docs) {
    const u: any = d.data();
    const source = (u.referral_source as string | undefined) ?? "(unset)";
    const isPaid = u.pro === true ||
      (u.purchase_types && Object.keys(u.purchase_types).length > 0);
    const gender = u.selected_gender;
    if (!bySource[source]) bySource[source] = { signups: 0, paid: 0, female: 0, male: 0 };
    bySource[source].signups++;
    if (isPaid) { bySource[source].paid++; totalPaid++; }
    if (gender === 'female') bySource[source].female++;
    else if (gender === 'male') bySource[source].male++;
  }

  console.log(`Total paid: ${totalPaid}  (overall conversion: ${(totalPaid/snap.size*100).toFixed(1)}%)\n`);

  // Sort by signup volume desc
  const sorted = Object.entries(bySource).sort((a, b) => b[1].signups - a[1].signups);
  console.log(`Source                       | Signups | Paid | Conv  | F   | M`);
  console.log(`-----------------------------|---------|------|-------|-----|----`);
  for (const [source, r] of sorted) {
    const conv = r.signups > 0 ? `${(r.paid/r.signups*100).toFixed(1)}%` : "—";
    console.log(`${source.padEnd(28)} | ${String(r.signups).padStart(7)} | ${String(r.paid).padStart(4)} | ${conv.padStart(5)} | ${String(r.female).padStart(3)} | ${String(r.male).padStart(3)}`);
  }
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
