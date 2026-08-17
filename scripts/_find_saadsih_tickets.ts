// Check which of the Saadi/Sadiq candidates have support tickets.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// UIDs from the 53 fuzzy matches
const UIDS: Record<string, string> = {
  "0HhSllHAMO8RbvcpyhTU": "Haleema Saadia",
  "3gLUtO9wc9Rs5dywpVsfztxNXmn2": "Qalb E Sadique",
  "48SLCAj8eAvXSNjrJSQv": "Adam (awalehsaadisamel)",
  "5bAH9e1wbnAL8YaS1lK0": "Samir Sadiq",
  "6a26C779Q3MoNk7ZZ09UG5VZDeQ2": "Muhammad Sadiq (aura)",
  "7brsb94d4UTAUkXxQU4GtTwvnxU2": "Sadiq Hussain",
  "7ouN6UeEvRT6h7ncnjkpldHRWg42": "Saadi Hamzi",
  "8Be1cCBT6ScBrOEtkYencF3O4Ot1": "Sadeeq Sambo",
  "BL5laDrF7QQam1YyJjWVdAG9RMw2": "Musadiq Ahmed",
  "CZROgtNrtvW55q7HJbLn9vkkt9z2": "Abdullah Saad(i)",
  "Ch1MJaCEAmOdObixrYmQlv3uMzf1": "Munazah Sadiq",
  "DcyDc1mXnnhQI1K5s5l2qK0zBcv2": "Ali Sadiq",
  "MEJd8yB4lAVVok92cDdzeeWCN423": "Sadiq Jafri",
  "Pwzkh4BSW3ZtlxDeqcMBfaMnnR93": "Muhammad Saad (irshad)",
  "QA8CaglZWgMIx82yT5UO": "David (sadiqmirza91)",
  "SG5z1gie9kbGB4Q0KSuu3P2NoV03": "Mogamat Saadiq Kleinsmith",
  "SWcvDMPTN8NTPQgEEGCJRIcTPYh2": "Amalia Abubakari Sadique",
  "Sa12pPxRyOVe3Nh1Ip6xqbZxOWq1": "Saadiq Adams",
  "V4BXA70VMohDun60gN0ZOW0zdRE3": "Saadi Yaiche",
  "X3vSHWIh7PUU7YECe23yNrVyqch1": "Jafar sadiq Pasha",
  "XWuYJsQ2aGMyu6B383bOyRPeC462": "Keshah (sadiqmirza91)",
  "YNeCIJafrRNRPXbvwn60e2mKsnp1": "Sadiq Yusuf",
  "Z9dFdF4M1HcKZXMmhIMLeCOb9Vh2": "Abdullah Alsaadi",
  "aKlDC8FgeXdxavmaUGny1PnNuNs2": "Muhammed Dhanish (sadhim)",
  "cSBwyliUlhcMSz4TvD7mz5fGJ6n2": "Afriyie Sadeeq",
  "dHFml6dkyLZXy56OFzF0GKTeXTk1": "Ali (alisaadi)",
  "gPMAeWyvjFV1Pcm70xKK": "Muhammad (saadiq.c2c)",
  "hgObFbSeuvadKPy36HAU4QYspgl1": "Abdullah Nasir Sadiq",
  "hiIEkISntPOCcocRVbO7qpyTehz1": "Mohammed Sadiq",
  "iji4NWdWoHMIHUrYpxE0duBi0r22": "Sadiq Mirza (91)",
  "j6kNWCwnFNN2ScnwGkBQw5lcV3T2": "Muhammad Sadiq (vivo)",
  "jwPnGt4ZXKUwjwvN4xAALWhfoaB2": "Saad (saadirony)",
  "k62qxj1TYvaBl9ylmkoK5GZ9qa82": "Saad Ilkal",
  "kGs7qYxDaAPhqtgO80YIZBYeR7E2": "Mohammad Sadhik",
  "l4xbrl7IBocz2hr4dGAZT9bES3j1": "Rohith Sadeesh",
  "p262bbxDOGVksjHBLESnoq3NNF12": "Musadiq Nazeer",
  "pWg7tepKD1a8nBKzoYdp3MlIVM82": "Sadiq (mirza102)",
  "q8QIS304xqcif83PGDOE": "Shivu (sadhiremath)",
  "rrlNMEv26tTuXSOzChRelyGi1ga2": "Sadiq Shaikh",
  "rsKfYqpoiphkvYopJKCKg5avFuT2": "Saadi Bin Hamid",
  "smkda3InqTh4h2PYi1viQTfkAxT2": "Usman Sadiq",
  "w4vue3kQVudfufsHlj1BBXDvsyT2": "Muhammad Saadullah",
  "xhi48whyF2htyD0NkJkPR2uBP2C3": "Mahjoub (saadi)",
  "yn001lHbPTPbPuzfabX6zGnJ8SU2": "Ayesha Saqlain Sadiq",
  "zE3ZJZkkT0bygbAJstl2rvcKgXQ2": "Owais Sadiq",
  "zEJo6WCcyQcqZNaIM10l1wLeTUj1": "Saadi Abbasi",
};

(async () => {
  // Pull all support tickets once (one scan, then filter in memory — faster than 53 queries)
  const all = await db.collection("support").get();
  const byUid: Record<string, { id: string; name: string; last_update?: string; last_from: string; awaiting_reply: boolean }[]> = {};

  for (const doc of all.docs) {
    const x = doc.data() as any;
    const uid = x.customer?.id;
    if (uid && UIDS[uid]) {
      const ts = x.last_update_at?.toDate?.()?.toISOString?.().split("T")[0] || "-";
      const lastFrom = x.last_message?.fromId === uid ? "USER" : "AADI";
      byUid[uid] ||= [];
      byUid[uid].push({
        id: doc.id,
        name: x.customer?.name || UIDS[uid],
        last_update: ts,
        last_from: lastFrom,
        awaiting_reply: lastFrom === "USER",
      });
    }
  }

  const hits = Object.entries(byUid);
  console.log(`\n${hits.length} of 45 candidates have support tickets:\n`);
  for (const [uid, tickets] of hits.sort((a, b) => (b[1][0].last_update || "").localeCompare(a[1][0].last_update || ""))) {
    const label = UIDS[uid];
    for (const t of tickets) {
      const flag = t.awaiting_reply ? "⚠ AWAITING" : "        ok";
      console.log(`  ${flag}  ${t.last_update}  ${label.padEnd(28)} ticket=${t.id}`);
    }
  }
  console.log("");
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
