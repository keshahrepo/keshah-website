import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// Count completed progress days
function completedDays(data: any): number {
  const progress = data.progress as Record<string, Array<{ is_completed?: boolean }>> | undefined;
  if (!progress) return 0;
  let n = 0;
  for (const [, ex] of Object.entries(progress)) {
    if (Array.isArray(ex) && ex.length > 0 && ex.every(e => e.is_completed === true)) n++;
  }
  return n;
}

(async () => {
  const snap = await db.collection("Users").where("scalp_less_tight", "!=", null).get();
  const users = snap.docs
    .filter(d => !d.data().is_deleted)
    .map(d => ({ uid: d.id, data: d.data(), completed: completedDays(d.data()) }));

  console.log(`Total regrowth readiness responders: ${users.length}\n`);

  const analyze = (label: string, filter: (u: typeof users[0]) => boolean) => {
    const subset = users.filter(filter);
    if (subset.length === 0) return;
    const scalpYes = subset.filter(u => u.data.scalp_less_tight === "yes").length;
    const hairYes = subset.filter(u => u.data.hair_fall_reduced === "yes").length;
    const bothYes = subset.filter(u => u.data.scalp_less_tight === "yes" && u.data.hair_fall_reduced === "yes").length;
    console.log(`${label.padEnd(45)} N=${String(subset.length).padStart(4)} | scalp=${Math.round(scalpYes/subset.length*100)}% | hair=${Math.round(hairYes/subset.length*100)}% | both=${Math.round(bothYes/subset.length*100)}%`);
  };

  console.log("FILTER".padEnd(45) + "    N  | scalp | hair | both");
  console.log("─".repeat(90));
  analyze("All responders (baseline)", () => true);
  console.log();

  console.log("— By COMPLETED DAYS (adherence) —");
  analyze("Completed 60+ days", u => u.completed >= 60);
  analyze("Completed 45+ days", u => u.completed >= 45);
  analyze("Completed 30+ days", u => u.completed >= 30);
  analyze("Completed 20+ days", u => u.completed >= 20);
  analyze("Completed 10+ days", u => u.completed >= 10);
  analyze("Completed <10 days (lazy)", u => u.completed < 10);
  console.log();

  console.log("— By PAYMENT STATUS —");
  analyze("Paid users (paidStoppage tag)", u => u.data.extra_user_tags?.includes("paidStoppage"));
  analyze("NOT paidStoppage tagged", u => !u.data.extra_user_tags?.includes("paidStoppage"));
  console.log();

  console.log("— By TREATMENT STAGE —");
  analyze("Currently in FREE_MAINTENANCE (graduated)", u => u.data.treatment_stage === "FREE_MAINTENANCE");
  analyze("Currently in FREE_STOPPAGE (active)", u => u.data.treatment_stage === "FREE_STOPPAGE");
  analyze("Currently in FREE_STOPPAGE_EXT (extending)", u => u.data.treatment_stage === "FREE_STOPPAGE_EXT");
  analyze("Currently in REGROWTH", u => u.data.treatment_stage === "REGROWTH");
  console.log();

  console.log("— By AGE (days since signup) —");
  const now = Date.now();
  analyze("Age >= 90 days", u => {
    const ca = u.data.created_at?.toDate?.();
    return !!ca && (now - ca.getTime()) / 86400000 >= 90;
  });
  analyze("Age 60-89 days", u => {
    const ca = u.data.created_at?.toDate?.();
    if (!ca) return false;
    const d = (now - ca.getTime()) / 86400000;
    return d >= 60 && d < 90;
  });
  analyze("Age < 60 days", u => {
    const ca = u.data.created_at?.toDate?.();
    if (!ca) return false;
    return (now - ca.getTime()) / 86400000 < 60;
  });
  console.log();

  console.log("— COMBINED (strictest defensible filter) —");
  analyze("Paid + 30+ completed + age >= 60d",
    u => u.data.extra_user_tags?.includes("paidStoppage")
      && u.completed >= 30
      && u.data.created_at?.toDate?.()
      && (now - u.data.created_at.toDate().getTime()) / 86400000 >= 60);
  analyze("Paid + 45+ completed",
    u => u.data.extra_user_tags?.includes("paidStoppage") && u.completed >= 45);
  analyze("Paid + 60+ completed",
    u => u.data.extra_user_tags?.includes("paidStoppage") && u.completed >= 60);

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
