import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "2KS4YWgW2LNS8DD5oNcMd1vMePA3";
(async () => {
  // Full message thread chronologically
  console.log("=== FULL SUPPORT THREAD (chronological) ===");
  const msgs = await db.collection("support").doc(UID).collection("messages").orderBy("timestamp", "asc").get();
  msgs.docs.forEach((m, i) => {
    const x: any = m.data();
    const ts = x.timestamp?._seconds ? new Date(x.timestamp._seconds * 1000).toISOString().slice(0, 19) : "?";
    const from = x.fromId === "0" ? "ADMIN" : "USER ";
    console.log(`[${i + 1}] ${ts} ${from}: ${x.content}`);
  });

  // Regrowth state
  console.log("");
  console.log("=== REGROWTH / TREATMENT STATE ===");
  const userDoc = await db.collection("Users").doc(UID).get();
  const u: any = userDoc.data();
  console.log("treatment_stage:", u.treatment_stage);
  console.log("regrowth_switched_at_date:", u.regrowth_switched_at_date);
  console.log("treatment_stage_switched_at_date:", JSON.stringify(u.treatment_stage_switched_at_date));
  console.log("treatment_stage_switched_at_day:", JSON.stringify(u.treatment_stage_switched_at_day));
  console.log("");
  console.log("regrowth_progress keys count:", Object.keys(u.regrowth_progress || {}).length);
  const rpKeys = Object.keys(u.regrowth_progress || {}).sort((a, b) => {
    const aN = parseInt(a.replace("day", ""), 10);
    const bN = parseInt(b.replace("day", ""), 10);
    return aN - bN;
  });
  console.log("first 5:", rpKeys.slice(0, 5).join(", "));
  console.log("last 10:", rpKeys.slice(-10).join(", "));
  console.log("");
  // Sample last 5 regrowth_progress entries — what shape do they have?
  for (const k of rpKeys.slice(-5)) {
    const entry = (u.regrowth_progress || {})[k];
    const isComplete = Array.isArray(entry) ? entry.every((e: any) => e?.is_completed === true) : "?";
    const sample = JSON.stringify(entry).slice(0, 250);
    console.log(`  ${k} (allComplete=${isComplete}): ${sample}`);
  }
  console.log("");
  console.log("progress (FREEV1) keys count:", Object.keys(u.progress || {}).length);
  const pKeys = Object.keys(u.progress || {}).sort((a, b) => {
    const aN = parseInt(a.replace("day", ""), 10);
    const bN = parseInt(b.replace("day", ""), 10);
    return aN - bN;
  });
  console.log("first 5:", pKeys.slice(0, 5).join(", "));
  console.log("last 10:", pKeys.slice(-10).join(", "));
  console.log("");
  for (const k of pKeys.slice(-5)) {
    const entry = (u.progress || {})[k];
    const isComplete = Array.isArray(entry) ? entry.every((e: any) => e?.is_completed === true) : "?";
    const sample = JSON.stringify(entry).slice(0, 250);
    console.log(`  ${k} (allComplete=${isComplete}): ${sample}`);
  }

  // Also pinch points
  console.log("");
  console.log("=== STREAK FIELDS ===");
  console.log("streak:", u.streak);
  console.log("longest_streak:", u.longest_streak);
  console.log("last_completed_day:", u.last_completed_day);
  console.log("last_completed_date:", u.last_completed_date);

  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
