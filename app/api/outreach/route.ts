import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { requireDashboardSession } from "@/lib/support/auth";

export const maxDuration = 60;

// GET  /api/outreach            — list US non-buyers from last N days
// POST /api/outreach             — { userId, action: "mark_sent" | "unmark" }
//
// "Non-buyer" = no converted_at, no paid_at, no first_paid_at (i.e. they
// signed up but never went through the paywall successfully — exactly the
// segment Aadi wants to text personally).
//
// "US" = phone_number.country_code === "US". Filtering by country_code on
// the parsed phone struct is more reliable than timezone (timezone covers
// the user's current location, not the phone's origin).
//
// outreach_sent_at gets written by the mark_sent action so already-texted
// users drop off the list. Idempotent.

const DEFAULT_DAYS = 7;
const HARD_LIMIT = 100;

type Row = {
  userId: string;
  firstName: string;
  phoneNumber: string;       // E.164 (+15551234567)
  phoneDisplay: string;      // pretty (+1 555 123-4567)
  signupAgeHours: number;
  referralSource: string;
  selectedGender: string;
  stage: string;             // human-readable funnel stage
  smsHref: string;           // pre-built sms: deep link
};

const MESSAGE_TEMPLATE = (firstName: string) =>
  `Hey ${firstName} — Aadi here from KESHAH (personal cell, actually me). Trying to figure out why people sign up but don't subscribe. Was it the price? The time commitment? Or doubts it actually works? My job is to fix whatever stopped you. As a thank you, I'd be happy to give you free access to KESHAH for a year (usually $99).`;

function prettyName(d: Record<string, unknown>): string {
  const first = d.first_name as string | undefined;
  if (first && first.trim()) return first.trim().split(/\s+/)[0];
  const wp = d.wp_user as { display_name?: string } | undefined;
  const display = wp?.display_name?.trim();
  if (display) return display.split(/\s+/)[0];
  const name = d.name as string | undefined;
  if (name && name.trim()) return name.trim().split(/\s+/)[0];
  return "";
}

function prettyPhone(complete: string): string {
  // +15551234567 → +1 (555) 123-4567
  const m = complete.match(/^\+(\d)(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+${m[1]} (${m[2]}) ${m[3]}-${m[4]}`;
  return complete;
}

function funnelStage(d: Record<string, unknown>): string {
  // Roughly classify how far they got. Earliest → latest.
  if (d.regrowth_treatment_purchased) return "Bought regrowth kit";
  if (d.converted_at) return "Subscribed (already)";
  if (d.nurture_started_at) return "Reached paywall, didn't sub";
  if (d.starter_photos_submit_submitted_once) return "Completed onboarding photos";
  if (d.commitment_answer) return "Past commitment step";
  if (d.hair_goal) return "Past hair goal";
  if (d.hair_loss_location) return "Past hair-loss-location";
  if (d.quiz_answers) return "Started quiz";
  if (d.referral_source) return "Past referral question";
  if (d.selected_gender) return "Past gender pick";
  return "Just signed up";
}

export async function GET(req: Request) {
  const session = await requireDashboardSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? Math.max(1, Math.min(60, parseInt(daysParam, 10))) : DEFAULT_DAYS;
  const limit = Math.min(HARD_LIMIT, parseInt(url.searchParams.get("limit") ?? "30", 10));
  const includeSent = url.searchParams.get("include_sent") === "1";

  const { db } = getFirebaseAdmin();
  const since = Timestamp.fromMillis(Date.now() - days * 86_400_000);
  const snap = await db.collection("Users").where("created_at", ">=", since).get();

  const now = Date.now();
  const rows: Row[] = [];

  snap.forEach((doc) => {
    const d = doc.data();
    if (d.is_deleted) return;

    // Non-buyer filter — bail on ANY signal that they may have paid.
    // The primary signals (converted_at / paid_at / first_paid_at) miss
    // ~5-10% of real payers due to a known write-gap (mobile app's
    // _handlePurchaseSuccess can fail silently for App Store direct
    // subscribes & restores). So we also check every secondary signal
    // that paid users tend to have set, to catch false-positives before
    // they get a "why didn't you subscribe" text. False-positives here
    // are way worse than missing a few legitimate non-payers.
    if (d.converted_at) return;
    if (d.paid_at) return;
    if (d.first_paid_at) return;
    if (d.regrowth_treatment_purchased) return;        // bought kit = paid
    if (d.scalp_health_support_purchased) return;      // bought support kit
    if (d.vip_treatment_purchased) return;             // legacy VIP
    if (d.subscription_plan) return;                   // sparse but if set, paid
    if (d.trial_status === "active") return;           // Razorpay trial
    if (d.trial_status === "converted") return;        // Razorpay trial→paid
    if (d.pro === true) return;                        // legacy VIP flag
    if (d.open_account === true) return;               // bypasses subscription
    // Sanity: if they completed onboarding to the point of starting Day 1,
    // they probably paid (start_date map gets set on Day 1 routine open).
    if (d.start_date && typeof d.start_date === "object") return;

    // US filter via phone country_code.
    const phone = d.phone_number as { complete_number?: string; country_code?: string } | undefined;
    if (!phone || phone.country_code !== "US" || !phone.complete_number) return;

    // Skip already-contacted unless caller asked.
    if (!includeSent && d.outreach_sent_at) return;

    const firstName = prettyName(d);
    if (!firstName) return; // can't personalize without a name

    const c = (d.created_at as Timestamp | undefined)?.toMillis?.();
    if (!c) return;
    const ageHrs = (now - c) / 3600_000;

    const message = MESSAGE_TEMPLATE(firstName);
    rows.push({
      userId: doc.id,
      firstName,
      phoneNumber: phone.complete_number,
      phoneDisplay: prettyPhone(phone.complete_number),
      signupAgeHours: Math.round(ageHrs * 10) / 10,
      referralSource: (d.referral_source as string) ?? "(unset)",
      selectedGender: (d.selected_gender as string) ?? "?",
      stage: funnelStage(d),
      // iOS Messages SMS URL scheme: sms:NUMBER&body=TEXT
      // (Apple wants &, not ?, for the first body param on iOS — quirky but works
      // in iOS Messages, Android default, and macOS.)
      smsHref: `sms:${phone.complete_number}&body=${encodeURIComponent(message)}`,
    });
  });

  rows.sort((a, b) => a.signupAgeHours - b.signupAgeHours); // newest first

  return NextResponse.json({
    days,
    total_in_window: rows.length,
    rows: rows.slice(0, limit),
    message_preview: MESSAGE_TEMPLATE("[Name]"),
    generated_at: new Date().toISOString(),
  });
}

// POST { userId, action: "mark_sent" | "unmark" }
export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { userId?: string; action?: string } | null;
  const userId = body?.userId?.trim();
  const action = body?.action;
  if (!userId || (action !== "mark_sent" && action !== "unmark")) {
    return NextResponse.json({ error: "userId and action required" }, { status: 400 });
  }

  const { db } = getFirebaseAdmin();
  const update: Record<string, unknown> = action === "mark_sent"
    ? { outreach_sent_at: Timestamp.now() }
    : { outreach_sent_at: FieldValue.delete() };

  await db.collection("Users").doc(userId).update(update);
  return NextResponse.json({ ok: true });
}
