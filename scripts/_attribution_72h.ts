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

(async () => {
  const since = new Date(Date.now() - 72 * 3_600_000);
  const snap = await db
    .collection("Users")
    .where("created_at", ">=", since)
    .get();

  let totalSignups = 0;
  let totalConverted = 0;
  const byGender: Record<GenderBucket, { signups: number; converted: number }> = {
    male: { signups: 0, converted: 0 },
    female: { signups: 0, converted: 0 },
    unknown: { signups: 0, converted: 0 },
  };
  const byRefGender: Record<string, Record<GenderBucket, { signups: number; converted: number }>> = {};
  const noReferral: Record<GenderBucket, { signups: number; converted: number }> = {
    male: { signups: 0, converted: 0 },
    female: { signups: 0, converted: 0 },
    unknown: { signups: 0, converted: 0 },
  };

  snap.forEach((doc) => {
    const d = doc.data();
    if (d.is_deleted) return;
    totalSignups++;
    const g = bucket(d.selected_gender);
    byGender[g].signups++;
    const converted = !!d.start_date;
    if (converted) {
      totalConverted++;
      byGender[g].converted++;
    }
    if (d.referral_source) {
      const src = String(d.referral_source);
      if (!byRefGender[src]) {
        byRefGender[src] = {
          male: { signups: 0, converted: 0 },
          female: { signups: 0, converted: 0 },
          unknown: { signups: 0, converted: 0 },
        };
      }
      byRefGender[src][g].signups++;
      if (converted) byRefGender[src][g].converted++;
    } else {
      noReferral[g].signups++;
      if (converted) noReferral[g].converted++;
    }
  });

  const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);

  console.log(`\n=== Attribution: last 72 hours (since ${since.toISOString()}) ===\n`);
  console.log(`Total signups: ${totalSignups}`);
  console.log(`Total converted (start_date set): ${totalConverted}  (${pct(totalConverted, totalSignups)})\n`);

  console.log(`--- By gender ---`);
  (["male", "female", "unknown"] as GenderBucket[]).forEach((g) => {
    const b = byGender[g];
    console.log(`  ${g.padEnd(8)} signups=${String(b.signups).padStart(4)}  conv=${String(b.converted).padStart(4)}  ${pct(b.converted, b.signups)}`);
  });

  console.log(`\n--- By referral_source × gender ---`);
  const rows = Object.entries(byRefGender)
    .map(([src, g]) => ({
      src,
      g,
      total: g.male.signups + g.female.signups + g.unknown.signups,
      conv: g.male.converted + g.female.converted + g.unknown.converted,
    }))
    .sort((a, b) => b.total - a.total);

  if (rows.length === 0) {
    console.log(`  (no users with referral_source set in this window)`);
  } else {
    console.log(`  ${"source".padEnd(20)} ${"M sign".padStart(7)} ${"M conv".padStart(7)} ${"M %".padStart(7)}   ${"F sign".padStart(7)} ${"F conv".padStart(7)} ${"F %".padStart(7)}   ${"U sign".padStart(7)} ${"U conv".padStart(7)}   ${"Total".padStart(7)} ${"Conv".padStart(7)} ${"%".padStart(7)}`);
    rows.forEach(({ src, g, total, conv }) => {
      console.log(
        `  ${src.padEnd(20)} ${String(g.male.signups).padStart(7)} ${String(g.male.converted).padStart(7)} ${pct(g.male.converted, g.male.signups).padStart(7)}   ${String(g.female.signups).padStart(7)} ${String(g.female.converted).padStart(7)} ${pct(g.female.converted, g.female.signups).padStart(7)}   ${String(g.unknown.signups).padStart(7)} ${String(g.unknown.converted).padStart(7)}   ${String(total).padStart(7)} ${String(conv).padStart(7)} ${pct(conv, total).padStart(7)}`
      );
    });
  }

  console.log(`\n--- No referral_source (organic / untagged) ---`);
  (["male", "female", "unknown"] as GenderBucket[]).forEach((g) => {
    const b = noReferral[g];
    console.log(`  ${g.padEnd(8)} signups=${String(b.signups).padStart(4)}  conv=${String(b.converted).padStart(4)}  ${pct(b.converted, b.signups)}`);
  });

  process.exit(0);
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
