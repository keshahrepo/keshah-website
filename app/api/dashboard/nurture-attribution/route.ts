// GET /api/dashboard/nurture-attribution?window=7d|30d|90d|all
//
// Aggregates nurture funnel + attribution across the User collection:
//   - Pool sizes: total nurture eligible, unsub/bounced, paid
//   - Per-channel send/delivery/open/click/conversion counts
//   - Per-day breakdown of conversions attributed to nurture
//   - Blended ARPU estimate → revenue attributed
//   - Rates: open, click, conversion
//
// Reads only. Requires dashboard session.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { requireDashboardSession } from "@/lib/support/auth";

export const maxDuration = 60;

const WINDOWS = {
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
  "all": null as null | number,
} as const;

type WindowKey = keyof typeof WINDOWS;

// Very rough blended ARPU for revenue attribution — used only for
// order-of-magnitude, not for accounting.
const BLENDED_ARPU_USD = 70;

interface ChannelRow {
  channel: string;
  sends: number;
  deliveries: number;
  opens: number;
  clicks: number;
  conversions: number;
  revenue_usd: number;
  open_rate: number;
  click_rate: number;
  conversion_rate: number;
}

interface DayRow {
  day: number;
  conversions: number;
  revenue_usd: number;
}

export async function GET(req: Request) {
  const session = await requireDashboardSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const win = (url.searchParams.get("window") ?? "30d") as WindowKey;
  if (!(win in WINDOWS)) return NextResponse.json({ error: "invalid window" }, { status: 400 });

  const { db } = getFirebaseAdmin();
  const ms = WINDOWS[win];
  const since = ms != null ? Timestamp.fromMillis(Date.now() - ms) : null;

  // Query nurture-eligible users. `nurture_started_at != null` is the
  // canonical "in the funnel" signal. Windowing filters to those who
  // started nurture within the window; "all" spans the whole pool.
  let q: FirebaseFirestore.Query = db
    .collection("Users")
    .where("nurture_started_at", "!=", null);
  if (since) q = q.where("nurture_started_at", ">=", since);
  const snap = await q.get();

  // Pool metrics
  let totalEligible = 0;
  let unsubBouncedComplained = 0;
  let paid = 0;

  // Per-channel counters
  const channels: Record<string, ChannelRow> = {
    email: emptyChannel("email"),
    sms: emptyChannel("sms"),
    whatsapp: emptyChannel("whatsapp"),
    push: emptyChannel("push"),
    unknown: emptyChannel("unknown"),
  };

  // Per-day conversion counters (which day of drip actually drove purchase)
  const perDay: Record<number, DayRow> = {};

  snap.forEach((doc) => {
    const d = doc.data();
    if (d.is_deleted) return;

    totalEligible++;
    if (
      d.nurture_email_unsubscribed === true ||
      d.nurture_email_bounced === true ||
      d.nurture_email_complained === true
    ) {
      unsubBouncedComplained++;
    }
    if (d.start_date || d.open_account === true) paid++;

    // ── Email side ─────────────────────────────────────────────────────
    const emailsSent: number[] = Array.isArray(d.nurture_emails_sent) ? d.nurture_emails_sent : [];
    channels.email.sends += emailsSent.length;
    channels.email.deliveries += Number(d.nurture_email_delivery_count || 0);
    channels.email.opens += Number(d.nurture_email_open_count || 0);
    channels.email.clicks += Number(d.nurture_email_click_count || 0);

    // ── SMS side ───────────────────────────────────────────────────────
    const smsSent: number[] = Array.isArray(d.nurture_sms_sent) ? d.nurture_sms_sent : [];
    channels.sms.sends += smsSent.length;
    channels.sms.deliveries += Number(d.nurture_sms_delivery_count || 0);

    // ── WhatsApp side ──────────────────────────────────────────────────
    const waSent: string[] = Array.isArray(d.nurture_whatsapp_sent) ? d.nurture_whatsapp_sent : [];
    channels.whatsapp.sends += waSent.length;

    // ── Attribution: only count if actually paid AND has nurture_conversion_channel ──
    const convChannel = d.nurture_conversion_channel as string | undefined;
    const convDay = d.nurture_conversion_day as number | null | undefined;
    const isPaid = !!d.first_paid_at || !!d.paid_at;
    if (isPaid && convChannel) {
      const key = channels[convChannel] ? convChannel : "unknown";
      channels[key].conversions++;
      channels[key].revenue_usd += BLENDED_ARPU_USD;
      if (typeof convDay === "number") {
        perDay[convDay] = perDay[convDay] || { day: convDay, conversions: 0, revenue_usd: 0 };
        perDay[convDay].conversions++;
        perDay[convDay].revenue_usd += BLENDED_ARPU_USD;
      }
    }
  });

  // Compute rates
  for (const row of Object.values(channels)) {
    row.open_rate = row.deliveries > 0 ? row.opens / row.deliveries : 0;
    row.click_rate = row.deliveries > 0 ? row.clicks / row.deliveries : 0;
    row.conversion_rate = row.sends > 0 ? row.conversions / row.sends : 0;
  }

  // Totals across channels
  const totals = Object.values(channels).reduce(
    (acc, r) => ({
      sends: acc.sends + r.sends,
      deliveries: acc.deliveries + r.deliveries,
      opens: acc.opens + r.opens,
      clicks: acc.clicks + r.clicks,
      conversions: acc.conversions + r.conversions,
      revenue_usd: acc.revenue_usd + r.revenue_usd,
    }),
    { sends: 0, deliveries: 0, opens: 0, clicks: 0, conversions: 0, revenue_usd: 0 }
  );

  const perDayRows = Object.values(perDay).sort((a, b) => a.day - b.day);

  return NextResponse.json({
    window: win,
    pool: {
      total_eligible: totalEligible,
      unsub_bounced_complained: unsubBouncedComplained,
      paid,
      sendable: totalEligible - unsubBouncedComplained - paid,
    },
    channels: Object.values(channels),
    per_day_conversions: perDayRows,
    totals,
    assumptions: {
      blended_arpu_usd: BLENDED_ARPU_USD,
      note:
        "Revenue is a rough estimate using blended ARPU. For accounting use RC/Stripe truth. " +
        "Conversion attribution is captured on first paid event within 7d of last nurture click.",
    },
    generated_at: new Date().toISOString(),
  });
}

function emptyChannel(name: string): ChannelRow {
  return {
    channel: name,
    sends: 0,
    deliveries: 0,
    opens: 0,
    clicks: 0,
    conversions: 0,
    revenue_usd: 0,
    open_rate: 0,
    click_rate: 0,
    conversion_rate: 0,
  };
}
