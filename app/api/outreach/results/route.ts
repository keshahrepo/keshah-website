import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { requireDashboardSession } from "@/lib/support/auth";

export const maxDuration = 60;

// GET /api/outreach/results?days=30&window=7
//
// The conversion side of 1:1 outreach: sent -> clicked -> started a trial,
// broken down by sender.
//
// This is the join nothing in the dashboard could do before. `outreach_sent_at`
// has been written for a while, but it was never compared against any
// conversion signal — so "I texted 500 people" and "N trials started" existed
// as two unrelated numbers, and no one could say which trials the texting
// actually produced.
//
// Three moments per lead, all on Users/{uid}:
//   sent     outreach_sent_at            written when a lead is marked texted
//   clicked  outreach_first_click_at     written when they tap the link
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
  sent: number;
  clicked: number;
  trials: number;
  paid: number;
  cancelled: number;
  stillInTrial: number;
  trialsOutsideWindow: number;
  clickRatePct: number | null;
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

  // Two independent queries rather than one scan of every user: a lead can be
  // sent-but-never-clicked, or clicked-without-ever-being-marked-sent (they
  // were texted outside the dashboard, or the link was forwarded). Both belong
  // in the funnel, so collect each and merge.
  const [sentSnap, clickSnap] = await Promise.all([
    db.collection("Users").where("outreach_sent_at", ">=", since).get(),
    db.collection("Users").where("outreach_first_click_at", ">=", since).get(),
  ]);

  const docs = new Map<string, Record<string, unknown>>();
  sentSnap.forEach((d) => docs.set(d.id, d.data()));
  clickSnap.forEach((d) => docs.set(d.id, d.data()));

  const bySender = new Map<string, SenderStats>();
  const conversions: RecentConversion[] = [];
  let sentTotal = 0;
  let clickedTotal = 0;
  let trialsTotal = 0;
  let paidTotal = 0;
  let cancelledTotal = 0;
  let stillInTrialTotal = 0;

  const stats = (sender: string): SenderStats => {
    let s = bySender.get(sender);
    if (!s) {
      s = {
        sender,
        sent: 0,
        clicked: 0,
        trials: 0,
        paid: 0,
        cancelled: 0,
        stillInTrial: 0,
        trialsOutsideWindow: 0,
        clickRatePct: null,
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
    const sentAt = ms(d.outreach_sent_at);

    // Attribute to the FIRST click's sender — that's the touch that earns
    // credit. Leads marked sent but never clicked have no sender recorded,
    // so they land under "(unattributed)" and still count toward `sent`.
    const sender =
      (d.outreach_first_click_sender as string | undefined)?.trim() ||
      (clickedAt ? "(unknown sender)" : "(unattributed)");
    const s = stats(sender);

    if (sentAt) {
      s.sent++;
      sentTotal++;
    }
    if (clickedAt) {
      s.clicked++;
      clickedTotal++;
    }

    // converted_at is the canonical signal; started_trial.at is the same
    // moment written alongside it, used as a fallback when one write lands
    // and the other doesn't.
    const startedTrial = d.started_trial as { at?: Timestamp } | undefined;
    const trialAt = ms(d.converted_at) ?? ms(startedTrial?.at);
    if (!trialAt || !clickedAt) return;

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
    clickRatePct: s.sent > 0 ? Math.round((s.clicked / s.sent) * 1000) / 10 : null,
    trialRatePct: s.clicked > 0 ? Math.round((s.trials / s.clicked) * 1000) / 10 : null,
    // Of the trials this sender is credited with, how many actually billed.
    paidRatePct: s.trials > 0 ? Math.round((s.paid / s.trials) * 1000) / 10 : null,
  }));
  senders.sort((a, b) => b.paid - a.paid || b.trials - a.trials || b.clicked - a.clicked);

  conversions.sort((a, b) => b.trialAt.localeCompare(a.trialAt));

  return NextResponse.json({
    days,
    attribution_window_days: windowDays,
    totals: {
      sent: sentTotal,
      clicked: clickedTotal,
      trials: trialsTotal,
      paid: paidTotal,
      cancelled: cancelledTotal,
      still_in_trial: stillInTrialTotal,
      click_rate_pct: sentTotal > 0 ? Math.round((clickedTotal / sentTotal) * 1000) / 10 : null,
      trial_rate_pct:
        clickedTotal > 0 ? Math.round((trialsTotal / clickedTotal) * 1000) / 10 : null,
      paid_rate_pct:
        trialsTotal > 0 ? Math.round((paidTotal / trialsTotal) * 1000) / 10 : null,
    },
    senders,
    conversions: conversions.slice(0, 100),
    generated_at: new Date().toISOString(),
  });
}
