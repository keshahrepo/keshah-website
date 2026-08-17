// Backfill start_date for a single freev2 FREE_STOPPAGE user missing it.
// Uses the user's own userLocalTimeZone so their day-1 = today in their tz.
//   npx tsx scripts/_fix_missing_sd_one.ts <email>          # dry run
//   APPLY=1 npx tsx scripts/_fix_missing_sd_one.ts <email>  # write
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const APPLY = process.env.APPLY === "1";
const EMAIL = process.argv[2];
if (!EMAIL) { console.log("usage: _fix_missing_sd_one.ts <email>"); process.exit(1); }

// Rough tz name → offset-in-mins + label
function tzMeta(tzName: string): { offsetMins: number; label: string } {
  const map: Record<string, { offsetMins: number; label: string }> = {
    "Asia/Kolkata": { offsetMins: 330, label: "IST" },
    "Asia/Jerusalem": { offsetMins: 180, label: "IDT" },  // summer IDT; winter IST is 120
  };
  if (map[tzName]) return map[tzName];
  // Fallback: derive via Intl for the current instant
  try {
    const now = new Date();
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tzName, timeZoneName: "short" });
    const parts = dtf.formatToParts(now);
    const label = parts.find(p => p.type === "timeZoneName")?.value || tzName;
    // Compute offset via toLocaleString hack
    const local = new Date(now.toLocaleString("en-US", { timeZone: tzName }));
    const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
    const offsetMins = Math.round((local.getTime() - utc.getTime()) / 60000);
    return { offsetMins, label };
  } catch {
    return { offsetMins: 0, label: "UTC" };
  }
}

function nowInTz(tzName: string): { date: string; time: string; offsetMins: number; label: string } {
  const meta = tzMeta(tzName);
  const now = new Date();
  const local = new Date(now.getTime() + meta.offsetMins * 60 * 1000);
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = local.getUTCFullYear();
  let h = local.getUTCHours();
  const min = String(local.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return {
    date: `${dd}/${mm}/${yyyy}`,
    time: `${String(h).padStart(2, "0")}:${min} ${ampm}`,
    offsetMins: meta.offsetMins,
    label: meta.label,
  };
}

(async () => {
  const snap = await db.collection("Users").where("email", "==", EMAIL).get();
  if (snap.size !== 1) { console.log(`Expected 1 doc, got ${snap.size} — abort`); process.exit(1); }
  const d = snap.docs[0];
  const x = d.data() as any;
  console.log(`user: ${x.email} · ${x.user_type} · ${x.treatment_stage} · uid=${d.id}`);
  console.log(`current start_date: ${x.start_date ? JSON.stringify(x.start_date) : "MISSING"}`);
  if (x.start_date) { console.log("already has start_date — nothing to do"); process.exit(0); }
  const tzName = x.user_local_time_zone || x.userLocalTimeZone || "UTC";
  const t = nowInTz(tzName);
  const start_date = {
    date: t.date,
    timeZoneOffsetInMins: t.offsetMins,
    timezone: t.label,
    time: t.time,
  };
  console.log(`tz: ${tzName}  →  will set start_date = ${JSON.stringify(start_date)}`);
  if (!APPLY) { console.log("\nDRY RUN. Re-run with APPLY=1."); process.exit(0); }
  await d.ref.update({ start_date });
  console.log("✓ written.");
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
