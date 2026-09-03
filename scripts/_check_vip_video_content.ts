import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  console.log("── VIP Exercise_Models — durations + descriptions ──");
  const vip = await db.collection("Exercise_Models").get();
  for (const doc of vip.docs) {
    const d = doc.data();
    const vids = (d.videos as any[]) ?? [];
    const durs = vids.map(v => v.duration).sort((a, b) => a - b);
    console.log(`\n${d.id ?? doc.id} — ${d.name ?? "?"}`);
    console.log(`  duration variants: ${durs.length ? durs.join(", ") + " min" : "(none)"}`);
    console.log(`  description: ${(d.description ?? "").slice(0, 250)}${(d.description ?? "").length > 250 ? "…" : ""}`);
    console.log(`  need: ${d.need ?? "(none)"}`);
  }

  console.log("\n\n── FreeV2 Stoppage models for comparison ──");
  const fv2 = await db.collection("FREEV2_MEN_STOPPAGE_EXERCISES_MODEL").get();
  for (const doc of fv2.docs) {
    const d = doc.data();
    const vids = (d.videos as any[]) ?? [];
    const durs = vids.map(v => v.duration).sort((a, b) => a - b);
    console.log(`\n${d.id ?? doc.id} — ${d.name ?? "?"}`);
    console.log(`  duration variants: ${durs.length ? durs.join(", ") + " min" : "(none)"}`);
    console.log(`  description snippet: ${(d.description ?? "").slice(0, 200)}${(d.description ?? "").length > 200 ? "…" : ""}`);
    console.log(`  need: ${d.need ?? "(none)"}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
