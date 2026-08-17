import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const D30 = new Date(Date.now() - 30 * 86_400_000);

function normPhone(p: any): string | null {
  if (!p) return null;
  const s = typeof p === "string" ? p : (p.complete_number || "");
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  // Strip country code — last 10 digits are usually the Indian phone
  return digits.slice(-10);
}

(async () => {
  // All 30d trial users
  const trials = await db.collection("Users")
    .where("trial_started_at", ">=", D30)
    .get();
  console.log(`Trials in last 30d: ${trials.size}\n`);

  // Collect trial user phones
  const trialPhones: Array<{ uid: string; phone: string | null; email: string; status: string; paid: boolean; signup: string }> = [];
  for (const d of trials.docs) {
    const x = d.data() as any;
    const phone = normPhone(x.phone_number) || normPhone(x.phone) || normPhone(x.wp_user?.phone);
    trialPhones.push({
      uid: d.id,
      phone,
      email: x.email || "-",
      status: x.trial_status || "?",
      paid: !!(x.razorpay_subscription_id && x.paid_at),
      signup: x.signup_source || "(unset)",
    });
  }

  // All web_funnel leads who got WA msgs
  const webLeads = await db.collection("Users")
    .where("signup_source", "==", "web_funnel")
    .get();

  const waPhoneMap: Map<string, { uid: string; sentCount: number; templates: string[] }> = new Map();
  for (const d of webLeads.docs) {
    const x = d.data() as any;
    const phone = normPhone(x.phone_number) || normPhone(x.phone);
    const sent: string[] = x.nurture_whatsapp_sent || [];
    if (phone && sent.length > 0) {
      waPhoneMap.set(phone, {
        uid: d.id,
        sentCount: sent.length,
        templates: sent,
      });
    }
  }
  console.log(`WA recipients with phone: ${waPhoneMap.size}\n`);

  // Match trials to WA recipients by phone
  let matchedByPhone = 0;
  let unmatched = 0;
  let noPhone = 0;
  const matches: Array<any> = [];

  for (const t of trialPhones) {
    if (!t.phone) {
      noPhone++;
      continue;
    }
    const waMatch = waPhoneMap.get(t.phone);
    if (waMatch) {
      matchedByPhone++;
      matches.push({ ...t, waUid: waMatch.uid, waMsgCount: waMatch.sentCount, templates: waMatch.templates });
    } else {
      unmatched++;
    }
  }

  console.log(`═══ TRIAL → WA MATCH BY PHONE ═══`);
  console.log(`  Matched to WA recipient:  ${matchedByPhone} / ${trialPhones.length}`);
  console.log(`  No WA match (new phone):  ${unmatched}`);
  console.log(`  No phone at all:          ${noPhone}\n`);

  console.log(`Matched trials (WA → trial by phone):`);
  matches.forEach(m => {
    console.log(`  ${m.phone} · trial_uid=${m.uid.slice(0,8)} · wa_uid=${m.waUid.slice(0,8)} · msgs=${m.waMsgCount} · ${m.status} · paid=${m.paid} · ${m.email}`);
  });

  // Also compute: of 849 WA recipients with phone, how many trialed?
  console.log(`\n═══ WA → TRIAL CONVERSION (phone-matched) ═══`);
  const trialPhoneSet = new Set(trialPhones.filter(t => t.phone).map(t => t.phone));
  let waLed = 0;
  for (const phone of waPhoneMap.keys()) {
    if (trialPhoneSet.has(phone)) waLed++;
  }
  console.log(`  ${waLed} of ${waPhoneMap.size} WA recipients went on to trial (${Math.round(waLed/waPhoneMap.size*1000)/10}%)`);

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
