import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

async function rc(uid: string) {
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${RC_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
async function batch<T, R>(items: T[], fn: (x: T) => Promise<R>, c=30): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({length: c}, async () => {
    while (true) { const idx = i++; if (idx >= items.length) break; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

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
  const docs = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Querying RC for ${docs.length} users...`);

  const users = await batch(docs, async (d) => {
    const data = d.data();
    const sub: any = await rc(d.id);
    const subs = sub?.subscriber?.subscriptions || {};
    let everPaid = false;
    for (const [pid, s] of Object.entries<any>(subs)) {
      if (pid.startsWith("rc_promo")) continue;
      if (s.period_type === "normal" || s.period_type === "intro") { everPaid = true; break; }
    }
    const hasRazorpay = !!data.razorpay_subscription_id;
    const hasPaidTag = data.extra_user_tags?.includes("paidStoppage");
    const isPaid = everPaid || hasRazorpay || hasPaidTag;
    return {
      uid: d.id,
      data,
      completed: completedDays(data),
      isPaid,
    };
  }, 30);

  const analyze = (label: string, filter: (u: typeof users[0]) => boolean) => {
    const subset = users.filter(filter);
    if (subset.length === 0) return;
    const scalpYes = subset.filter(u => u.data.scalp_less_tight === "yes").length;
    const hairYes = subset.filter(u => u.data.hair_fall_reduced === "yes").length;
    const bothYes = subset.filter(u => u.data.scalp_less_tight === "yes" && u.data.hair_fall_reduced === "yes").length;
    console.log(`${label.padEnd(45)} N=${String(subset.length).padStart(4)} | scalp=${Math.round(scalpYes/subset.length*100)}% | hair=${Math.round(hairYes/subset.length*100)}% | both=${Math.round(bothYes/subset.length*100)}%`);
  };

  console.log(`\nFILTER                                         ` + `   N  | scalp | hair | both`);
  console.log("─".repeat(90));
  analyze("All responders (baseline)", () => true);
  console.log();
  console.log("— REAL paid users (RC normal/intro OR Razorpay OR paidStoppage tag) —");
  analyze("Ever paid (any signal)", u => u.isPaid);
  analyze("Never paid", u => !u.isPaid);
  console.log();
  console.log("— Ever paid + adherence —");
  analyze("Ever paid + 30+ days completed", u => u.isPaid && u.completed >= 30);
  analyze("Ever paid + 45+ days completed", u => u.isPaid && u.completed >= 45);
  analyze("Ever paid + in maintenance", u => u.isPaid && u.data.treatment_stage === "FREE_MAINTENANCE");

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
