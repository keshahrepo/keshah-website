import { getFirebaseAdmin } from "../lib/firebase-admin";
(async () => {
  const { db } = getFirebaseAdmin();
  const snap = await db.collection("Users")
    .orderBy("trial_started_at", "desc")
    .limit(20)
    .get();
  const trials = snap.docs.filter((d: any) => d.data().trial_status);
  console.log("Total docs with trial_started_at:", snap.size);
  console.log("Docs with trial_status set:", trials.length);
  trials.forEach((d: any) => {
    const data = d.data();
    const started = data.trial_started_at?.toDate?.()?.toISOString() || "?";
    console.log(`  ${d.id.slice(0,10)} · ${data.trial_status} · ${started} · plan=${data.plan || "-"} · provider=${data.payment_provider || "-"} · email=${data.email || "-"} · providerId=${data.providerId || "-"}`);
  });
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
