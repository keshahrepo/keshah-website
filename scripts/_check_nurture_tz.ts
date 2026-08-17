import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  // Sample 500 nurture-eligible users
  const snap = await db
    .collection("Users")
    .where("nurture_started_at", "!=", null)
    .orderBy("nurture_started_at", "desc")
    .limit(500)
    .get();

  let hasSnake = 0;    // user_local_time_zone
  let hasCamel = 0;    // userLocalTimeZone
  let hasEither = 0;
  let hasNeither = 0;
  const tzHist: Record<string, number> = {};
  const now = Date.now();
  const localHourHist: Record<string, number> = {};

  const samples: any[] = [];

  for (const doc of snap.docs) {
    const d = doc.data() as any;
    const snake = d.user_local_time_zone;
    const camel = d.userLocalTimeZone;
    if (snake) hasSnake++;
    if (camel) hasCamel++;
    if (snake || camel) hasEither++;
    else hasNeither++;

    const tz = snake || camel;
    if (tz) {
      tzHist[tz] = (tzHist[tz] || 0) + 1;
      try {
        const h = new Date(now).toLocaleString("en-US", {
          timeZone: tz,
          hour: "numeric",
          hour12: false,
        });
        const bucket = String(parseInt(h));
        localHourHist[bucket] = (localHourHist[bucket] || 0) + 1;
      } catch {
        localHourHist["INVALID_TZ"] = (localHourHist["INVALID_TZ"] || 0) + 1;
      }
    } else {
      // Fallback EST
      const h = new Date(now).toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: false,
      });
      const bucket = String(parseInt(h));
      localHourHist[`FALLBACK_EST_${bucket}`] = (localHourHist[`FALLBACK_EST_${bucket}`] || 0) + 1;
    }

    if (samples.length < 5) {
      samples.push({
        uid: doc.id,
        email: d.email,
        snake_tz: snake,
        camel_tz: camel,
        country: d.country,
        started: d.nurture_started_at?.toDate?.()?.toISOString(),
      });
    }
  }

  console.log(`─── TZ field presence (of 500 sampled) ───`);
  console.log(`  user_local_time_zone (snake): ${hasSnake}`);
  console.log(`  userLocalTimeZone (camel):    ${hasCamel}`);
  console.log(`  has either:                    ${hasEither}`);
  console.log(`  has neither → fallback EST:    ${hasNeither}`);
  console.log(``);
  console.log(`─── Top 10 timezones ───`);
  const topTz = Object.entries(tzHist).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [tz, n] of topTz) console.log(`  ${tz}: ${n}`);
  console.log(``);
  console.log(`─── Current local hour distribution (right now, per user's tz) ───`);
  const sortedHour = Object.entries(localHourHist).sort((a, b) => b[1] - a[1]);
  for (const [h, n] of sortedHour) console.log(`  hour ${h}: ${n}`);
  console.log(``);
  console.log(`─── Samples ───`);
  for (const s of samples) console.log(`  ${JSON.stringify(s)}`);

  process.exit(0);
})().catch((e) => { console.error("ERR:", e); process.exit(1); });
