import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

type GenderBucket = "male" | "female" | "unknown";
function bucket(g: unknown): GenderBucket {
  if (g === "male") return "male";
  if (g === "female") return "female";
  return "unknown";
}

// Same geo classification used by the live dashboard
const TIER_1_TZ = new Set([
  "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Denver",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Toronto",
  "America/Vancouver", "America/Edmonton", "America/Halifax", "Europe/London",
  "Europe/Dublin", "Europe/Berlin", "Europe/Amsterdam", "Europe/Stockholm",
  "Europe/Copenhagen", "Europe/Oslo", "Europe/Zurich", "Europe/Vienna",
  "Europe/Brussels", "Europe/Helsinki", "Europe/Paris", "Australia/Sydney",
  "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth", "Australia/Adelaide",
  "Pacific/Auckland", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Dubai",
  "Asia/Kuwait", "Asia/Qatar", "Asia/Riyadh",
]);
function geo(tz: string): "tier_1" | "india" | "tier_2" {
  if (tz === "Asia/Kolkata") return "india";
  if (TIER_1_TZ.has(tz)) return "tier_1";
  return "tier_2";
}

async function fetchWindow(start: Date, end: Date) {
  const snap = await db
    .collection("Users")
    .where("created_at", ">=", start)
    .where("created_at", "<", end)
    .get();
  return snap.docs.map((d) => d.data()).filter((d) => !d.is_deleted);
}

(async () => {
  const now = new Date();
  const start72 = new Date(now.getTime() - 72 * 3_600_000);
  const startPrior = new Date(now.getTime() - 144 * 3_600_000);

  const [cur, prior] = await Promise.all([
    fetchWindow(start72, now),
    fetchWindow(startPrior, start72),
  ]);

  const summarize = (users: any[]) => {
    const total = users.length;
    let convertedCount = 0;
    let onboardingCompleteCount = 0;
    let paywallViewedCount = 0;
    const byGeo: Record<string, { signups: number; converted: number }> = {
      tier_1: { signups: 0, converted: 0 },
      india: { signups: 0, converted: 0 },
      tier_2: { signups: 0, converted: 0 },
    };
    const bySignupSource: Record<string, { signups: number; converted: number }> = {};
    const byRefAndGender: Record<string, Record<GenderBucket, { signups: number; converted: number }>> = {};
    const buyerSources: { src: string | null; gender: GenderBucket; geo: string; signupSource: string | null }[] = [];

    users.forEach((d) => {
      const converted = !!d.start_date;
      if (converted) convertedCount++;
      if (d.hair_goal) onboardingCompleteCount++;
      if (d.commitment_answer) paywallViewedCount++;

      const g = bucket(d.selected_gender);
      const tz = d.userLocalTimeZone || "";
      const region = geo(tz);
      byGeo[region].signups++;
      if (converted) byGeo[region].converted++;

      const ss = d.signup_source || "(none)";
      if (!bySignupSource[ss]) bySignupSource[ss] = { signups: 0, converted: 0 };
      bySignupSource[ss].signups++;
      if (converted) bySignupSource[ss].converted++;

      const src = d.referral_source || null;
      if (src) {
        if (!byRefAndGender[src]) {
          byRefAndGender[src] = {
            male: { signups: 0, converted: 0 },
            female: { signups: 0, converted: 0 },
            unknown: { signups: 0, converted: 0 },
          };
        }
        byRefAndGender[src][g].signups++;
        if (converted) byRefAndGender[src][g].converted++;
      }
      if (converted) {
        buyerSources.push({ src, gender: g, geo: region, signupSource: d.signup_source || null });
      }
    });

    return {
      total,
      convertedCount,
      onboardingCompleteCount,
      paywallViewedCount,
      byGeo,
      bySignupSource,
      byRefAndGender,
      buyerSources,
    };
  };

  const c = summarize(cur);
  const p = summarize(prior);

  const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);
  const delta = (now: number, then: number) => {
    if (then === 0) return now === 0 ? "—" : "+∞";
    const d = ((now - then) / then) * 100;
    return `${d >= 0 ? "+" : ""}${d.toFixed(0)}%`;
  };

  console.log(`\n=== 72h vs prior 72h ===`);
  console.log(`Signups:     ${c.total} vs ${p.total}  (${delta(c.total, p.total)})`);
  console.log(`Converted:   ${c.convertedCount} vs ${p.convertedCount}  (${delta(c.convertedCount, p.convertedCount)})`);
  console.log(`Conv rate:   ${pct(c.convertedCount, c.total)} vs ${pct(p.convertedCount, p.total)}`);

  console.log(`\n=== Funnel depth (current 72h) ===`);
  console.log(`Signed up:           ${c.total}`);
  console.log(`Reached hair_goal:   ${c.onboardingCompleteCount}  (${pct(c.onboardingCompleteCount, c.total)})`);
  console.log(`Reached paywall:     ${c.paywallViewedCount}  (${pct(c.paywallViewedCount, c.total)})  | paywall→buy: ${pct(c.convertedCount, c.paywallViewedCount)}`);
  console.log(`Converted:           ${c.convertedCount}  (${pct(c.convertedCount, c.total)})`);

  console.log(`\n=== Geo split (current 72h) ===`);
  (["tier_1", "india", "tier_2"] as const).forEach((r) => {
    const b = c.byGeo[r];
    console.log(`  ${r.padEnd(8)} signups=${String(b.signups).padStart(4)}  conv=${String(b.converted).padStart(3)}  ${pct(b.converted, b.signups)}`);
  });

  console.log(`\n=== Landing path (signup_source) ===`);
  Object.entries(c.bySignupSource)
    .sort((a, b) => b[1].signups - a[1].signups)
    .slice(0, 12)
    .forEach(([s, b]) => {
      console.log(`  ${s.padEnd(28)} signups=${String(b.signups).padStart(4)}  conv=${String(b.converted).padStart(3)}  ${pct(b.converted, b.signups)}`);
    });

  console.log(`\n=== Buyers (${c.convertedCount}) — referral × geo ===`);
  c.buyerSources.forEach((b, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. src=${(b.src || "(none)").padEnd(24)} gender=${b.gender.padEnd(7)} geo=${b.geo.padEnd(7)} signup_source=${b.signupSource || "(none)"}`);
  });

  process.exit(0);
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
