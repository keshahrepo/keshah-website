// Match the App Store reviewer "SaadSsih" (Aug 3 2026) to a real user.
// Signal: paid annual on Apple, received microneedling upsell → REGROWTH stage or regrowth_treatment_purchased/shown.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UIDS = [
  "0HhSllHAMO8RbvcpyhTU","3gLUtO9wc9Rs5dywpVsfztxNXmn2","48SLCAj8eAvXSNjrJSQv",
  "5bAH9e1wbnAL8YaS1lK0","6a26C779Q3MoNk7ZZ09UG5VZDeQ2","7brsb94d4UTAUkXxQU4GtTwvnxU2",
  "7ouN6UeEvRT6h7ncnjkpldHRWg42","8Be1cCBT6ScBrOEtkYencF3O4Ot1","BL5laDrF7QQam1YyJjWVdAG9RMw2",
  "CZROgtNrtvW55q7HJbLn9vkkt9z2","Ch1MJaCEAmOdObixrYmQlv3uMzf1","DcyDc1mXnnhQI1K5s5l2qK0zBcv2",
  "DdxipIFPh7Msik6oemvFMaucDyp2","LkHvOH4bjLTUkBOFoecHfTJAfQ63","MEJd8yB4lAVVok92cDdzeeWCN423",
  "MuA1ppo3TRPGvOdo28QCPkW2DYN2","Pwzkh4BSW3ZtlxDeqcMBfaMnnR93","QA8CaglZWgMIx82yT5UO",
  "S7LXb6XIk5efWGFCWZCwoxyUIaf2","SG5z1gie9kbGB4Q0KSuu3P2NoV03","SWcvDMPTN8NTPQgEEGCJRIcTPYh2",
  "Sa12pPxRyOVe3Nh1Ip6xqbZxOWq1","Uh816rY9Kudrw45T41VqsSrzwWT2","V4BXA70VMohDun60gN0ZOW0zdRE3",
  "X3vSHWIh7PUU7YECe23yNrVyqch1","XWuYJsQ2aGMyu6B383bOyRPeC462","YNeCIJafrRNRPXbvwn60e2mKsnp1",
  "Z9dFdF4M1HcKZXMmhIMLeCOb9Vh2","aKlDC8FgeXdxavmaUGny1PnNuNs2","cSBwyliUlhcMSz4TvD7mz5fGJ6n2",
  "dHFml6dkyLZXy56OFzF0GKTeXTk1","eDPjnO6R1JewudWaaPI1QAJnqTH3","gPMAeWyvjFV1Pcm70xKK",
  "hgObFbSeuvadKPy36HAU4QYspgl1","hiIEkISntPOCcocRVbO7qpyTehz1","iO3KzAxkUFelAMk3fAXZCTSH5Gb2",
  "iji4NWdWoHMIHUrYpxE0duBi0r22","j6kNWCwnFNN2ScnwGkBQw5lcV3T2","jwPnGt4ZXKUwjwvN4xAALWhfoaB2",
  "k62qxj1TYvaBl9ylmkoK5GZ9qa82","kGs7qYxDaAPhqtgO80YIZBYeR7E2","l4xbrl7IBocz2hr4dGAZT9bES3j1",
  "p262bbxDOGVksjHBLESnoq3NNF12","pWg7tepKD1a8nBKzoYdp3MlIVM82","q8QIS304xqcif83PGDOE",
  "rrlNMEv26tTuXSOzChRelyGi1ga2","rsKfYqpoiphkvYopJKCKg5avFuT2","smkda3InqTh4h2PYi1viQTfkAxT2",
  "w4vue3kQVudfufsHlj1BBXDvsyT2","xhi48whyF2htyD0NkJkPR2uBP2C3","yn001lHbPTPbPuzfabX6zGnJ8SU2",
  "zE3ZJZkkT0bygbAJstl2rvcKgXQ2","zEJo6WCcyQcqZNaIM10l1wLeTUj1",
];

(async () => {
  type Row = { uid: string; email: string; name: string; stage: string; paid_at: string; provider: string; product: string; regrowth: boolean; severity: string };
  const rows: Row[] = [];
  for (const uid of UIDS) {
    const u = await db.collection("Users").doc(uid).get();
    if (!u.exists) continue;
    const x = u.data() as any;
    rows.push({
      uid,
      email: (x.email || "").toString().slice(0, 40),
      name: [x.first_name, x.last_name].filter(Boolean).join(" ") || (x.wp_user?.display_name || "-"),
      stage: x.treatment_stage || "-",
      paid_at: x.paid_at?.toDate?.()?.toISOString?.().split("T")[0] || "-",
      provider: (x.payment_provider || "-").toString(),
      product: (x.product_id || x.subscription_id || "-").toString(),
      regrowth: !!x.regrowth_treatment_purchased || !!x.regrowth_kit_purchased || (x.treatment_stage || "").includes("REGROWTH"),
      severity: (x.hair_loss_severity || x.severity || "-").toString(),
    });
  }

  // Filter: Apple + paid + regrowth/microneedling shown
  const apple = rows.filter(r => /apple|app_store|revenue.*apple/i.test(r.provider) || r.email.includes("privaterelay"));
  const paidApple = apple.filter(r => r.paid_at !== "-");

  console.log(`\n=== ALL ${rows.length} candidates ===`);
  for (const r of rows) {
    console.log(`  ${r.email.padEnd(42)} ${r.name.padEnd(24)} stage=${r.stage.padEnd(20)} paid=${r.paid_at} prov=${r.provider.padEnd(12)} regrowth=${r.regrowth} sev=${r.severity}`);
  }

  console.log(`\n=== APPLE users (${apple.length}) ===`);
  for (const r of apple) {
    console.log(`  ${r.email.padEnd(42)} ${r.name.padEnd(24)} paid=${r.paid_at} regrowth=${r.regrowth} sev=${r.severity}`);
  }

  console.log(`\n=== PAID APPLE users (${paidApple.length}) — strongest candidates ===`);
  for (const r of paidApple) {
    console.log(`  ${r.email.padEnd(42)} ${r.name.padEnd(24)} paid=${r.paid_at} product=${r.product.slice(0,40)} regrowth=${r.regrowth} sev=${r.severity}`);
  }

  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
