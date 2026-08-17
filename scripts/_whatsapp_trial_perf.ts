import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const now = Date.now();
const D7 = new Date(now - 7 * 86_400_000);
const D14 = new Date(now - 14 * 86_400_000);
const D30 = new Date(now - 30 * 86_400_000);

const pct = (n: number, d: number) => d === 0 ? "0%" : `${Math.round((n / d) * 1000) / 10}%`;

(async () => {
  // ═══════════════════════════════════════════════════
  // 1. WHATSAPP: web funnel leads + messages
  // ═══════════════════════════════════════════════════
  console.log("═══ WHATSAPP NURTURE ═══\n");

  const webLeads = await db.collection("Users")
    .where("signup_source", "==", "web_funnel")
    .get();
  console.log(`Total web_funnel leads (all time): ${webLeads.size}`);

  let leads7d = 0, leads14d = 0, leads30d = 0;
  let recipients = 0, recipients7d = 0, recipients14d = 0;
  let totalMsgs = 0, msgs7d = 0, msgs14d = 0;
  const byTemplate: Record<string, number> = {};
  const byTemplate14d: Record<string, number> = {};
  let nurtureCompleted = 0;

  for (const d of webLeads.docs) {
    const x = d.data();
    const started = x.nurture_started_at?.toDate?.() ?? x.created_at?.toDate?.();
    if (started && started >= D7) leads7d++;
    if (started && started >= D14) leads14d++;
    if (started && started >= D30) leads30d++;

    const sent: string[] = x.nurture_whatsapp_sent || [];
    if (sent.length > 0) recipients++;
    if (sent.length > 0 && started && started >= D7) recipients7d++;
    if (sent.length > 0 && started && started >= D14) recipients14d++;

    totalMsgs += sent.length;
    for (const key of sent) byTemplate[key] = (byTemplate[key] || 0) + 1;

    if (started && started >= D14) {
      msgs14d += sent.length;
      for (const key of sent) byTemplate14d[key] = (byTemplate14d[key] || 0) + 1;
    }
    if (started && started >= D7) msgs7d += sent.length;
    if (x.nurture_completed) nurtureCompleted++;
  }

  console.log(`  Last 7d:  ${leads7d} leads`);
  console.log(`  Last 14d: ${leads14d} leads`);
  console.log(`  Last 30d: ${leads30d} leads\n`);

  console.log(`Unique recipients (≥1 WA msg): ${recipients} (${pct(recipients, webLeads.size)} of all leads)`);
  console.log(`  Last 7d:  ${recipients7d} recipients (${pct(recipients7d, leads7d)} of 7d leads)`);
  console.log(`  Last 14d: ${recipients14d} recipients (${pct(recipients14d, leads14d)} of 14d leads)\n`);

  console.log(`Total WA messages sent (all time): ${totalMsgs}`);
  console.log(`  Last 7d:  ${msgs7d}`);
  console.log(`  Last 14d: ${msgs14d}\n`);

  console.log(`Nurture completed (all 5 msgs): ${nurtureCompleted}`);
  console.log(`  Completion rate: ${pct(nurtureCompleted, recipients)} of recipients\n`);

  console.log(`By template (all time):`);
  Object.entries(byTemplate).sort().forEach(([k, v]) => {
    console.log(`  ${String(v).padStart(5)} × ${k}`);
  });
  console.log();
  console.log(`By template (last 14d):`);
  Object.entries(byTemplate14d).sort().forEach(([k, v]) => {
    console.log(`  ${String(v).padStart(5)} × ${k}`);
  });

  // Funnel drop-off by message index
  console.log(`\nFunnel drop-off (last 14d cohort):`);
  const order = ["nurture_day1_trial", "nurture_day1_questions", "nurture_day2_social", "nurture_day3_how", "nurture_day5_final"];
  const d14Recipients = recipients14d;
  for (const t of order) {
    const c = byTemplate14d[t] || 0;
    console.log(`  ${t.padEnd(30)} ${String(c).padStart(4)} (${pct(c, d14Recipients)} of recipients)`);
  }

  // ═══════════════════════════════════════════════════
  // 2. TRIAL OFFER: conversion + status
  // ═══════════════════════════════════════════════════
  console.log(`\n\n═══ TRIAL OFFER ═══\n`);

  // All users with trial_started_at
  const trialsSnap = await db.collection("Users")
    .where("trial_started_at", ">=", D30)
    .get();

  const trials7d = trialsSnap.docs.filter((d: any) => d.data().trial_started_at?.toDate?.() >= D7);
  const trials14d = trialsSnap.docs.filter((d: any) => d.data().trial_started_at?.toDate?.() >= D14);

  console.log(`Total trials started (last 30d): ${trialsSnap.size}`);
  console.log(`  Last 7d:  ${trials7d.length}`);
  console.log(`  Last 14d: ${trials14d.length}\n`);

  // Trial status breakdown
  const statusCount: Record<string, number> = {};
  for (const d of trialsSnap.docs) {
    const s = (d.data() as any).trial_status || "(none)";
    statusCount[s] = (statusCount[s] || 0) + 1;
  }
  console.log(`Trial status breakdown (last 30d):`);
  Object.entries(statusCount).sort((a, b) => b[1] - a[1]).forEach(([s, n]) => {
    console.log(`  ${s.padEnd(15)} ${String(n).padStart(4)} (${pct(n, trialsSnap.size)})`);
  });

  // Source: web funnel vs app
  let webTrials = 0, appTrials = 0, unknownTrials = 0;
  for (const d of trialsSnap.docs) {
    const x = d.data() as any;
    if (x.signup_source === "web_funnel") webTrials++;
    else if (x.signup_source) appTrials++;
    else unknownTrials++;
  }
  console.log(`\nBy source (last 30d):`);
  console.log(`  web_funnel:  ${webTrials}`);
  console.log(`  app (other): ${appTrials}`);
  console.log(`  unknown:     ${unknownTrials}`);

  // Plan breakdown
  const planCount: Record<string, number> = {};
  for (const d of trialsSnap.docs) {
    const p = (d.data() as any).plan || "(none)";
    planCount[p] = (planCount[p] || 0) + 1;
  }
  console.log(`\nBy plan (last 30d):`);
  Object.entries(planCount).sort((a, b) => b[1] - a[1]).forEach(([p, n]) => {
    console.log(`  ${p.padEnd(18)} ${String(n).padStart(4)}`);
  });

  // Trial → paid conversion
  let converted = 0, pendingFirstCharge = 0, canceled = 0;
  for (const d of trialsSnap.docs) {
    const x = d.data() as any;
    if (x.razorpay_subscription_id && x.paid_at) converted++;
    else if (x.trial_status === "active") pendingFirstCharge++;
    else if (x.trial_status === "canceled" || x.trial_status === "cancelled") canceled++;
  }
  const totalWithOutcome = converted + canceled;
  console.log(`\nTrial → Paid conversion (last 30d):`);
  console.log(`  Converted (paid):      ${converted}`);
  console.log(`  Active (not charged):  ${pendingFirstCharge}`);
  console.log(`  Canceled:              ${canceled}`);
  if (totalWithOutcome > 0) {
    console.log(`  Conversion rate:       ${pct(converted, totalWithOutcome)} (of resolved)`);
  }

  // ═══════════════════════════════════════════════════
  // 3. WHATSAPP ATTRIBUTION: trial starts among WA recipients
  // ═══════════════════════════════════════════════════
  console.log(`\n\n═══ WHATSAPP → TRIAL ATTRIBUTION ═══\n`);

  let webRecipTrials = 0, webNonRecipTrials = 0;
  let webRecipCount = 0, webNonRecipCount = 0;
  for (const d of webLeads.docs) {
    const x = d.data() as any;
    const started = x.nurture_started_at?.toDate?.() ?? x.created_at?.toDate?.();
    if (!started || started < D14) continue;
    const hasMsg = (x.nurture_whatsapp_sent || []).length > 0;
    const hasTrial = !!x.trial_started_at;
    if (hasMsg) {
      webRecipCount++;
      if (hasTrial) webRecipTrials++;
    } else {
      webNonRecipCount++;
      if (hasTrial) webNonRecipTrials++;
    }
  }
  console.log(`Last 14d web leads:`);
  console.log(`  WA recipients:    ${webRecipCount} · ${webRecipTrials} started trial (${pct(webRecipTrials, webRecipCount)})`);
  console.log(`  Non-recipients:   ${webNonRecipCount} · ${webNonRecipTrials} started trial (${pct(webNonRecipTrials, webNonRecipCount)})`);

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
