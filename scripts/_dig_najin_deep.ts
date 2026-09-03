import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UID = "NtFTj5PCTGYUGLLx9xPMnEVXUMb2";

async function main() {
  const doc = await db.collection("Users").doc(UID).get();
  const data = doc.data() ?? {};

  // ─── Progress + aftercare_progress: reconstruct what exercises he did ───
  interface ExerciseEntry {
    exercise_id?: string;
    duration?: number;
    description?: string;
    completed?: boolean;
    is_completed?: boolean;
  }
  const buckets: { name: string; map: Record<string, ExerciseEntry[]> }[] = [
    { name: "progress", map: (data.progress ?? {}) as Record<string, ExerciseEntry[]> },
    { name: "aftercare_progress", map: (data.aftercare_progress ?? {}) as Record<string, ExerciseEntry[]> },
    { name: "regrowth_progress", map: (data.regrowth_progress ?? {}) as Record<string, ExerciseEntry[]> },
  ];

  for (const b of buckets) {
    const days = Object.keys(b.map).sort((a, z) => {
      const na = parseInt(a.replace(/\D/g, ""), 10);
      const nz = parseInt(z.replace(/\D/g, ""), 10);
      return na - nz;
    });
    console.log(`\n═══ ${b.name} (${days.length} days) ═══`);
    if (days.length === 0) continue;
    console.log(`first: ${days[0]}   last: ${days[days.length - 1]}`);

    // Aggregate exercise IDs + total durations
    const idCounts: Record<string, number> = {};
    const idDurations: Record<string, Set<number>> = {};
    let totalMin = 0;
    for (const day of days) {
      const list = b.map[day] ?? [];
      for (const ex of list) {
        const id = ex.exercise_id ?? "(no-id)";
        idCounts[id] = (idCounts[id] ?? 0) + 1;
        const dur = ex.duration ?? 0;
        if (!idDurations[id]) idDurations[id] = new Set();
        idDurations[id].add(dur);
        totalMin += dur;
      }
    }
    console.log(`unique exercise IDs (${Object.keys(idCounts).length}) with duration samples:`);
    for (const id of Object.keys(idCounts).sort((a, z) => idCounts[z] - idCounts[a])) {
      const durs = [...(idDurations[id] ?? [])].sort();
      console.log(`  ${id.padEnd(40)}  x${idCounts[id]}   durations: ${durs.join(", ")} min`);
    }
    console.log(`total minutes logged: ${totalMin}`);

    // Sample first + last day fully
    console.log(`\nsample [${days[0]}]: ${JSON.stringify(b.map[days[0]]).slice(0, 500)}`);
    if (days.length > 1) {
      console.log(`sample [${days[days.length - 1]}]: ${JSON.stringify(b.map[days[days.length - 1]]).slice(0, 500)}`);
    }
  }

  // ─── Interpret his current state vs history ───
  console.log(`\n\n═══ Interpretation ═══`);
  console.log(`current: user_type=${data.user_type}, treatment_stage=${data.treatment_stage}, pro=${data.pro}`);
  console.log(`current entitlement (RC): keshah_experience_standard (monthly since ${data.first_paid_at?.toDate?.().toISOString?.() ?? "?"})`);
  console.log(`historic purchase (wp_user): ${JSON.stringify(data.wp_user?.purchase_types)}`);
  console.log(`aftercare_active_stage: ${JSON.stringify(data.aftercare_active_stage)}`);
  console.log(`aftercare_truncated_at: ${data.aftercare_truncated_at?.toDate?.().toISOString?.()}  below_day=${data.aftercare_truncated_below_day}`);
  console.log(`aftercare_lifetime_completed_days: ${data.aftercare_lifetime_completed_days}`);
  console.log(`maintenance_mode_active: ${data.maintenance_mode_active}`);
  console.log(`modified_at: ${data.modified_at?.toDate?.().toISOString?.()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
