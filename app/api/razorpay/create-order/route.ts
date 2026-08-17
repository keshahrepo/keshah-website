// Creates a Razorpay SUBSCRIPTION (recurring) for India users.
// Plans are pre-created in Razorpay and their IDs hardcoded below.
// The subscription handles RBI e-mandate, UPI AutoPay, and auto-renewal.

import { NextResponse } from "next/server";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const PLANS: Record<string, { planId: string; description: string }> = {
  monthly: {
    planId: "plan_SeFkQVq6KZCndb",
    description: "KESHAH — ₹499/month",
  },
  threeMonth: {
    planId: "plan_SeFkQzYJzIpX1n",
    description: "KESHAH — ₹999 every 3 months",
  },
  // /startindia2 v1 — weekly decoy tier (legacy, ₹250).
  weekly: {
    planId: "plan_Sggs2Z4Q4N9lze",
    description: "KESHAH — ₹250/week",
  },
  // /startindia2 v2 — paid-traffic pricing (Option B).
  // ₹99/wk shown for monthly (billed ₹396/mo) + ₹199/wk weekly decoy.
  weeklyV2: {
    planId: "plan_SigP1kSbt9Y5AS",
    description: "KESHAH — ₹199/week",
  },
  monthlyV2: {
    planId: "plan_SigRPa6EvM0rTN",
    description: "KESHAH — ₹99/week, billed ₹396/month",
  },
  // /startindiafree2 — premium-priced monthly with 1-day free trial.
  // Hypothesis: high LTV play. Filters for serious buyers via price.
  monthlyPremium: {
    planId: "plan_SitT01OpbwH7yo",
    description: "KESHAH — ₹999/month",
  },
  // /startindia2 v3 — premium pricing pair. Weekly decoy at ₹499/wk vs
  // monthly winner at ₹996/mo (shown as ₹249/wk × 4 = ₹996/mo, exact math).
  weeklyPremium: {
    planId: "plan_Sj1u63xh7lUyyE",
    description: "KESHAH — ₹499/week",
  },
  monthlyPremium996: {
    planId: "plan_Sj2Ca6Ubo0AsTU",
    description: "KESHAH — ₹996/month",
  },
};

export async function POST(req: Request) {
  try {
    const { plan, trial, trialDays, uid } = (await req.json()) as {
      plan: string;
      trial?: boolean;
      /** How many days of free trial before first real charge. Defaults
       *  to 7 when trial=true. /startindiafree sends 1 for a 1-day trial. */
      trialDays?: number;
      /** Firebase UID if the user is already authenticated (anon or real)
       *  at paywall time. Stored in Razorpay `notes.uid` so the webhook
       *  can link the subscription back to a Firestore doc even if the
       *  client never completes `/api/razorpay/verify`. */
      uid?: string;
    };
    const config = PLANS[plan];
    if (!config) {
      return NextResponse.json({ ok: false, error: "invalid_plan" }, { status: 400 });
    }

    const effectiveTrialDays = trial ? Math.max(1, trialDays ?? 7) : 0;
    const startAt = trial
      ? Math.floor(Date.now() / 1000) + effectiveTrialDays * 24 * 60 * 60
      : undefined;

    const totalCount =
      plan === "weekly" ? 52 : plan === "monthly" ? 12 : 4;

    const subscription = await razorpay.subscriptions.create({
      plan_id: config.planId,
      total_count: totalCount,
      ...(startAt ? { start_at: startAt } : {}),
      notes: {
        plan,
        source: trial
          ? effectiveTrialDays === 1
            ? "web_india_trial_1d"
            : "web_india_trial"
          : "web_india",
        trial_days: String(effectiveTrialDays),
        ...(uid ? { uid } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.id,
      plan,
      trial: !!trial,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[razorpay/create-order]", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
        ? JSON.stringify(err)
        : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
