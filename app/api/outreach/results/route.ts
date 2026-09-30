import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { requireDashboardSession } from "@/lib/support/auth";

export const maxDuration = 60;

// GET /api/outreach/results?days=30&window=7
//
// The conversion side of 1:1 outreach: tapped -> started a trial -> paid,
// broken down by sender.
//
// DELIBERATELY STARTS AT THE TAP, not at the send. outreach_sent_at only gets
// written when a lead is marked sent from the dashboard's own lead list, and
// senders text from their own tools instead — so it would sit at zero and drag
// a meaningless "tap rate" with it. Counting from the tap means every number
// here is one we actually observe.
//
// Two moments per lead, both on Users/{uid}:
//   tapped   outreach_first_click_at     written when they tap the link
//                                        (in-app on the happy path — the OS
//                                        opens the app directly and the web
//                                        route never runs)
//   trial    converted_at / started_trial  written by the paywall on purchase
//
// CREDIT RULE: a trial counts for a sender when the lead clicked their link
// and started the trial AFTER that click, within ATTRIBUTION_WINDOW_DAYS.
// Because the click is stamped on the user document rather than a session, a
// lead who clicks Monday and buys Thursday still counts.
//
// `converted_at` is the canonical purchase signal, NOT `start_date` —
// start_date is written on onboarding completion whether or not they paid, so
// anything keyed on it overstates conversion.

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_WINDOW_DAYS = 7;
const MAX_LOOKBACK_DAYS = 180;

type SenderStats = {
  sender: string;
  clicked: number;
  trials: number;
  paid: number;
  cancelled: number;
  stillInTrial: number;
  trialsOutsideWindow: number;
  // Lifetime revenue of the leads this sender is credited with. Accumulated
  // by the RevenueCat webhook from the store's own price / tax / commission
  // figures — see recordRevenue in api/revenuecat/webhook.
  revenueUsd: number;
  proceedsUsd: number;
  trialRatePct: number | null;
  paidRatePct: number | null;
};

type RecentConversion = {
  userId: string;
  firstName: string;
  sender: string;
  clickedAt: string;
  trialAt: string;
  hoursToTrial: number;
  withinWindow: boolean;
  // Outcome of that trial, using the same definitions as the Trial
  // dashboard: converted_trial is webhook-written on actual post-trial
  // billing, so it is the real paid signal rather than "got past the
  // paywall". started_trial / converted_at only mean the latter.
  outcome: "paid" | "cancelled" | "in_trial";
};

function ms(v: unknown): number | null {
  const t = v as Timestamp | undefined;
  return t && typeof t.toMillis === "function" ? t.toMillis() : null;
}

function firstName(d: Record<string, unknown>): string {
  const f = d.first_name as string | undefined;
  if (f?.trim()) return f.trim().split(/\s+/)[0];
  const wp = d.wp_user as { display_name?: string } | undefined;
  if (wp?.display_name?.trim()) return wp.display_name.trim().split(/\s+/)[0];
  return "(no name)";
}

export async function GET(req: Request) {
  const session = await requireDashboardSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const days = Math.max(
    1,
    Math.min(
      MAX_LOOKBACK_DAYS,
      parseInt(url.searchParams.get("days") ?? String(DEFAULT_LOOKBACK_DAYS), 10) ||
        DEFAULT_LOOKBACK_DAYS
    )
  );
  const windowDays = Math.max(
    1,
    Math.min(
      90,
      parseInt(url.searchParams.get("window") ?? String(DEFAULT_WINDOW_DAYS), 10) ||
        DEFAULT_WINDOW_DAYS
    )
  );
  const windowMs = windowDays * 86_400_000;

  const { db } = getFirebaseAdmin();
  const since = Timestamp.fromMillis(Date.now() - days * 86_400_000);

  const clickSnap = await db
    .collection("Users")
    .where("outreach_first_click_at", ">=", since)
    .get();

  const docs = new Map<string, Record<string, unknown>>();
  clickSnap.forEach((d) => docs.set(d.id, d.data()));

  const bySender = new Map<string, SenderStats>();
  const conversions: RecentConversion[] = [];
  let clickedTotal = 0;
  let trialsTotal = 0;
  let paidTotal = 0;
  let cancelledTotal = 0;
  let stillInTrialTotal = 0;
  let revenueTotal = 0;
  let proceedsTotal = 0;

  const stats = (sender: string): SenderStats => {
    let s = bySender.get(sender);
    if (!s) {
      s = {
        sender,
        clicked: 0,
        trials: 0,
        paid: 0,
        cancelled: 0,
        stillInTrial: 0,
        trialsOutsideWindow: 0,
        revenueUsd: 0,
        proceedsUsd: 0,
        trialRatePct: null,
        paidRatePct: null,
      };
      bySender.set(sender, s);
    }
    return s;
  };

  docs.forEach((d, userId) => {
    if (d.is_deleted) return;

    const clickedAt = ms(d.outreach_first_click_at);
    if (!clickedAt) return;

    // Attribute to the FIRST tap's sender — that's the touch that earns
    // credit, and it's written once so a later sender can't claim a lead
    // someone else already reached.
    const sender =
      (d.outreach_first_click_sender as string | undefined)?.trim() || "(unknown sender)";
    const s = stats(sender);

    s.clicked++;
    clickedTotal++;

    // converted_at is the canonical signal; started_trial.at is the same
    // moment written alongside it, used as a fallback when one write lands
    // and the other doesn't.
    const startedTrial = d.started_trial as { at?: Timestamp } | undefined;
    const trialAt = ms(d.converted_at) ?? ms(startedTrial?.at);
    if (!trialAt) return;

    // Only forward-in-time conversions count. A trial that predates the click
    // wasn't caused by it.
    if (trialAt < clickedAt) return;

    const outcome: "paid" | "cancelled" | "in_trial" = d.converted_trial
      ? "paid"
      : d.subscription_status === "cancelled"
        ? "cancelled"
        : "in_trial";

    const withinWindow = trialAt - clickedAt <= windowMs;
    if (withinWindow) {
      s.trials++;
      trialsTotal++;
      // Revenue is only counted for trials inside the window, so it lines up
      // exactly with the conversions being credited.
      const rev = typeof d.revenue_usd_total === "number" ? d.revenue_usd_total : 0;
      const proc = typeof d.proceeds_usd_total === "number" ? d.proceeds_usd_total : 0;
      s.revenueUsd += rev;
      s.proceedsUsd += proc;
      revenueTotal += rev;
      proceedsTotal += proc;

      if (outcome === "paid") {
        s.paid++;
        paidTotal++;
      } else if (outcome === "cancelled") {
        s.cancelled++;
        cancelledTotal++;
      } else {
        s.stillInTrial++;
        stillInTrialTotal++;
      }
    } else {
      s.trialsOutsideWindow++;
    }

    conversions.push({
      userId,
      firstName: firstName(d),
      sender,
      clickedAt: new Date(clickedAt).toISOString(),
      trialAt: new Date(trialAt).toISOString(),
      hoursToTrial: Math.round(((trialAt - clickedAt) / 3_600_000) * 10) / 10,
      withinWindow,
      outcome,
    });
  });

  const senders = [...bySender.values()].map((s) => ({
    ...s,
    trialRatePct: s.clicked > 0 ? Math.round((s.trials / s.clicked) * 1000) / 10 : null,
    // Of the trials this sender is credited with, how many actually billed.
    paidRatePct: s.trials > 0 ? Math.round((s.paid / s.trials) * 1000) / 10 : null,
    revenueUsd: Math.round(s.revenueUsd * 100) / 100,
    proceedsUsd: Math.round(s.proceedsUsd * 100) / 100,
  }));
  senders.sort((a, b) => b.paid - a.paid || b.trials - a.trials || b.clicked - a.clicked);

  conversions.sort((a, b) => b.trialAt.localeCompare(a.trialAt));

  return NextResponse.json({
    days,
    attribution_window_days: windowDays,
    totals: {
      clicked: clickedTotal,
      trials: trialsTotal,
      paid: paidTotal,
      cancelled: cancelledTotal,
      still_in_trial: stillInTrialTotal,
      trial_rate_pct:
        clickedTotal > 0 ? Math.round((trialsTotal / clickedTotal) * 1000) / 10 : null,
      paid_rate_pct:
        trialsTotal > 0 ? Math.round((paidTotal / trialsTotal) * 1000) / 10 : null,
      revenue_usd: Math.round(revenueTotal * 100) / 100,
      proceeds_usd: Math.round(proceedsTotal * 100) / 100,
    },
    senders,
    conversions: conversions.slice(0, 100),
    generated_at: new Date().toISOString(),
  });
}
