/**
 * STOP+ target audience: long-tenured FreeV2 paid users (>100 days in).
 *
 * Reports:
 *   - Total FreeV2 paid users with tenure > 100 days
 *   - Distribution of days-since-start (tenure buckets)
 *   - Distribution of days-completed (from progress map, is_completed: true)
 *   - Engagement ratio = daysCompleted / daysSinceStart
 *   - Recent activity: any completion in last 7 / 30 days?
 *   - Sample 20 rows with details
 *
 * Paid signal follows reference_keshah_paid_signal.md:
 *   converted_at || first_paid_at || paid_at (NOT `pro==true`; `pro` is legacy VIP)
 */
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const DAY_MS = 86_400_000;

function tsToMs(v: any): number | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    // "DD/MM/YYYY" formatted date support
    const parts = v.split("/");
    if (parts.length === 3) {
      const dt = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (!isNaN(dt.getTime())) return dt.getTime();
    }
    const parsed = Date.parse(v);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

function startDateMs(u: any): number | null {
  // start_date is a map { date: "YYYY-MM-DD" | "DD/MM/YYYY", time: "HH:mm", timezone: "..." }
  const sd = u.start_date;
  if (!sd) return null;
  if (typeof sd === "string") return tsToMs(sd);
  if (typeof sd?.date === "string") return tsToMs(sd.date);
  return null;
}

type CompletedInfo = { completedDays: number[]; lastCompletionDayNum: number | null };

function inspectProgress(progress: any): CompletedInfo {
  const days: number[] = [];
  let lastDayNum: number | null = null;
  if (!progress || typeof progress !== "object") return { completedDays: days, lastCompletionDayNum: null };
  for (const k of Object.keys(progress)) {
    if (!k.startsWith("day")) continue;
    const n = parseInt(k.slice(3), 10);
    if (!Number.isFinite(n)) continue;
    const arr = progress[k];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    // Follow feedback memory: is_completed must be true on at least one entry.
    const isDone = arr.some((e: any) => e?.is_completed === true);
    if (isDone) {
      days.push(n);
      if (lastDayNum == null || n > lastDayNum) lastDayNum = n;
    }
  }
  days.sort((a, b) => a - b);
  return { completedDays: days, lastCompletionDayNum: lastDayNum };
}

// Timestamp of most recent completed exercise. Real shape:
//   { is_completed: true, completed_date: "YYYY-MM-DD", completed_time: "HH:mm", ... }
function lastCompletionMs(progress: any): number | null {
  if (!progress || typeof progress !== "object") return null;
  let maxMs: number | null = null;
  for (const k of Object.keys(progress)) {
    if (!k.startsWith("day")) continue;
    const arr = progress[k];
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      if (e?.is_completed !== true) continue;
      const cd = e.completed_date as string | undefined;
      const ct = e.completed_time as string | undefined;
      if (cd) {
        const iso = ct ? `${cd}T${ct}:00` : `${cd}T00:00:00`;
        const ms = Date.parse(iso);
        if (!isNaN(ms) && (maxMs == null || ms > maxMs)) maxMs = ms;
      }
      // Also check the older/alternate fields, just in case.
      const others = [e.completed_at, e.completedAt, e.timestamp];
      for (const f of others) {
        const ms = tsToMs(f);
        if (ms != null && (maxMs == null || ms > maxMs)) maxMs = ms;
      }
    }
  }
  return maxMs;
}

function bucketTenure(d: number): string {
  if (d < 120) return "100-119";
  if (d < 150) return "120-149";
  if (d < 200) return "150-199";
  if (d < 250) return "200-249";
  if (d < 300) return "250-299";
  if (d < 400) return "300-399";
  return "400+";
}

function bucketCompleted(n: number): string {
  if (n < 10) return "0-9";
  if (n < 30) return "10-29";
  if (n < 60) return "30-59";
  if (n < 100) return "60-99";
  if (n < 200) return "100-199";
  return "200+";
}

function bucketEngagement(pct: number): string {
  if (pct < 10) return "0-9%";
  if (pct < 25) return "10-24%";
  if (pct < 50) return "25-49%";
  if (pct < 75) return "50-74%";
  return "75-100%";
}

(async () => {
  console.log("Pulling FreeV2 users with converted_at (paid trial signal)...");
  // Primary paid signal per reference doc.
  const paidSnap = await db.collection("Users").where("converted_at", "!=", null).get();
  console.log(`  users with converted_at set: ${paidSnap.size}`);

  const now = Date.now();

  type Row = {
    id: string;
    email: string;
    treatmentStage: string;
    daysSinceStart: number;
    daysCompleted: number;
    engagementPct: number;
    lastCompletionDayNum: number | null;
    lastCompletionAgoDays: number | null;
    convertedAgoDays: number | null;
    gender: string;
  };

  const eligible: Row[] = [];
  let scannedFreev2 = 0;
  let deletedSkipped = 0;
  let noStartDate = 0;

  for (const d of paidSnap.docs) {
    const u: any = d.data();
    if (u.is_deleted) { deletedSkipped++; continue; }
    if (u.user_type !== "freev2") continue;
    scannedFreev2++;

    const sdMs = startDateMs(u);
    const createdMs = tsToMs(u.created_at);
    const anchor = sdMs ?? createdMs;
    if (anchor == null) { noStartDate++; continue; }
    const daysSinceStart = Math.floor((now - anchor) / DAY_MS);
    if (daysSinceStart <= 100) continue;

    const { completedDays, lastCompletionDayNum } = inspectProgress(u.progress);
    const daysCompleted = completedDays.length;
    const engagementPct = daysSinceStart > 0
      ? Math.round((daysCompleted / daysSinceStart) * 1000) / 10
      : 0;
    const lastMs = lastCompletionMs(u.progress);
    const lastAgo = lastMs != null ? Math.floor((now - lastMs) / DAY_MS) : null;
    const convertedMs = tsToMs(u.converted_at);
    const convertedAgo = convertedMs != null ? Math.floor((now - convertedMs) / DAY_MS) : null;

    eligible.push({
      id: d.id,
      email: (u.email as string | undefined) ?? "(no email)",
      treatmentStage: (u.treatment_stage as string | undefined) ?? "(unset)",
      daysSinceStart,
      daysCompleted,
      engagementPct,
      lastCompletionDayNum,
      lastCompletionAgoDays: lastAgo,
      convertedAgoDays: convertedAgo,
      gender: (u.selected_gender as string | undefined) ?? "(unset)",
    });
  }

  console.log(`\nFreeV2 paid docs scanned: ${scannedFreev2}`);
  console.log(`Deleted skipped:           ${deletedSkipped}`);
  console.log(`Missing start_date+created:${noStartDate}`);
  console.log(`ELIGIBLE (daysSinceStart>100): ${eligible.length}`);

  // ---- Distributions ----
  const tenureBuckets: Record<string, number> = {};
  const completedBuckets: Record<string, number> = {};
  const engagementBuckets: Record<string, number> = {};
  const stageCounts: Record<string, number> = {};
  const genderCounts: Record<string, number> = {};

  let active7 = 0, active30 = 0, active60 = 0, noCompletionSignal = 0;

  for (const r of eligible) {
    tenureBuckets[bucketTenure(r.daysSinceStart)] = (tenureBuckets[bucketTenure(r.daysSinceStart)] || 0) + 1;
    completedBuckets[bucketCompleted(r.daysCompleted)] = (completedBuckets[bucketCompleted(r.daysCompleted)] || 0) + 1;
    engagementBuckets[bucketEngagement(r.engagementPct)] = (engagementBuckets[bucketEngagement(r.engagementPct)] || 0) + 1;
    stageCounts[r.treatmentStage] = (stageCounts[r.treatmentStage] || 0) + 1;
    genderCounts[r.gender] = (genderCounts[r.gender] || 0) + 1;
    if (r.lastCompletionAgoDays == null) noCompletionSignal++;
    else {
      if (r.lastCompletionAgoDays <= 7) active7++;
      if (r.lastCompletionAgoDays <= 30) active30++;
      if (r.lastCompletionAgoDays <= 60) active60++;
    }
  }

  const total = eligible.length;
  const pct = (n: number) => total ? `${((n / total) * 100).toFixed(1)}%` : "0%";

  const printBuckets = (title: string, buckets: Record<string, number>, order: string[]) => {
    console.log(`\n=== ${title} ===`);
    for (const b of order) {
      const n = buckets[b] || 0;
      console.log(`  ${b.padEnd(12)} ${String(n).padStart(4)}  ${pct(n).padStart(6)}`);
    }
  };

  printBuckets("Tenure (daysSinceStart)", tenureBuckets, ["100-119","120-149","150-199","200-249","250-299","300-399","400+"]);
  printBuckets("Days completed (is_completed:true)", completedBuckets, ["0-9","10-29","30-59","60-99","100-199","200+"]);
  printBuckets("Engagement % (daysCompleted / daysSinceStart)", engagementBuckets, ["0-9%","10-24%","25-49%","50-74%","75-100%"]);

  console.log(`\n=== Recent activity (any completion) ===`);
  console.log(`  Active in last  7d: ${active7}  ${pct(active7)}`);
  console.log(`  Active in last 30d: ${active30}  ${pct(active30)}`);
  console.log(`  Active in last 60d: ${active60}  ${pct(active60)}`);
  console.log(`  No usable completion timestamp: ${noCompletionSignal}  ${pct(noCompletionSignal)}`);

  console.log(`\n=== Treatment stage breakdown ===`);
  for (const [k, v] of Object.entries(stageCounts).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${k.padEnd(24)} ${String(v).padStart(4)}  ${pct(v)}`);
  }

  console.log(`\n=== Gender breakdown ===`);
  for (const [k, v] of Object.entries(genderCounts).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${k.padEnd(10)} ${String(v).padStart(4)}  ${pct(v)}`);
  }

  // ---- Sample 20 rows: deterministic, spread by tenure ----
  // Sort by tenure desc, then evenly sample 20.
  eligible.sort((a, b) => b.daysSinceStart - a.daysSinceStart);
  const sampleN = Math.min(20, eligible.length);
  const step = eligible.length / sampleN;
  const sample: Row[] = [];
  for (let i = 0; i < sampleN; i++) {
    const idx = Math.floor(i * step);
    sample.push(eligible[idx]);
  }

  console.log(`\n=== Sample 20 (spread across tenure) ===`);
  console.log(
    "  " +
    "email".padEnd(40) +
    "stage".padEnd(22) +
    "tenure".padStart(7) +
    "  done".padStart(6) +
    "  eng%".padStart(6) +
    "  lastDay".padStart(9) +
    "  lastAgo".padStart(9)
  );
  for (const r of sample) {
    const em = (r.email.length > 38 ? r.email.slice(0, 37) + "…" : r.email).padEnd(40);
    const st = (r.treatmentStage.length > 21 ? r.treatmentStage.slice(0, 20) + "…" : r.treatmentStage).padEnd(22);
    console.log(
      "  " + em + st +
      String(r.daysSinceStart).padStart(7) +
      String(r.daysCompleted).padStart(6) +
      `${r.engagementPct}%`.padStart(6) +
      String(r.lastCompletionDayNum ?? "-").padStart(9) +
      String(r.lastCompletionAgoDays ?? "-").padStart(9)
    );
  }

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e?.message ?? e, e?.stack); process.exit(1); });
