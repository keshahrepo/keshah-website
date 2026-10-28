/**
 * Copy for the creator lifecycle emails and pushes (trial result, pay sent,
 * claims, days off, first posting day, warm-up, the end of an agreement).
 * The no-bank-details wording lives in invoice-auto.ts invoiceReadyEmail. Pure: callers send them with lib/email sendEmail (from
 * CREATOR_FROM_NAME) and lib/push notify(), which never throws.
 */
import type { PushMessage } from "../push";
import { CREATOR_SIGNOFF, SYSTEM_FOOTER } from "./invite";
import { fmtShort, fmtWeekdayLong } from "./lifecycle";
import { fmtMoney } from "./time";
import type { YyyyMm, YyyyMmDd } from "./types";

export interface Mail {
  subject: string;
  text: string;
}

const hi = (first: string) => `Hi ${first || "there"},`;

function monthName(month: YyyyMm): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

// ---------------------------------------------------------------- trial result

/** Keep: what changes from their first full-plan day. */
export function trialPassedEmail(input: { firstName: string; fullPlanFrom: YyyyMmDd; plan?: { videos: number; baseCents: number } }): Mail {
  const plan = input.plan;
  return {
    subject: "You're a KESHAH Creator",
    text: [
      hi(input.firstName),
      "",
      "You passed your trial, so you're now a KESHAH Creator. Well done, and welcome to the team properly.",
      "",
      "Here's what changes:",
      "",
      ...(plan
        ? [
            plan.videos > 3
              ? `• From ${fmtWeekdayLong(input.fullPlanFrom)}, you post ${plan.videos} videos every weekday instead of 3.`
              : `• From ${fmtWeekdayLong(input.fullPlanFrom)}, you keep posting ${plan.videos} videos every weekday.`,
            `• Your pay moves to ${fmtMoney(plan.baseCents)} a month.`,
          ]
        : [
            `• From ${fmtWeekdayLong(input.fullPlanFrom)}, you post 5 videos every weekday instead of 3.`,
            "• Your pay moves to $1,000 a month.",
          ]),
      "• Your videos now earn bonuses: $15 when one passes 100K views, and $100 when it passes 1M.",
      "",
      "Your trial pay is on your next invoice as usual. The app has everything else.",
      "",
      "Best,",
      CREATOR_SIGNOFF,
    ].join("\n"),
  };
}

/** Don't continue: kind, with their final trial pay. */
export function trialEndedEmail(input: { firstName: string; finalPayCents: number; payBy: YyyyMmDd }): Mail {
  return {
    subject: "Your KESHAH trial",
    text: [
      hi(input.firstName),
      "",
      "Thank you for the work you put into your trial. We've decided not to continue, so your contract ends with your 20th posting day.",
      "",
      input.finalPayCents > 0
        ? `You're still paid for every trial day you posted. Your final trial pay of ${fmtMoney(input.finalPayCents)} arrives by ${fmtShort(input.payBy)}. You can see the invoice in the app.`
        : "You're paid for every trial day you posted, and that pay has already gone out. You can see your invoices in the app.",
      "",
      "We really appreciate you giving it a go, and we wish you all the best.",
      "",
      "Best,",
      CREATOR_SIGNOFF,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------- pay

export function invoicePaidPush(month: YyyyMm, cents: number, number: string): PushMessage {
  return {
    title: `Your ${monthName(month)} pay is on its way`,
    body: `${fmtMoney(cents)} has been sent to your bank.`,
    data: { type: "invoice", number },
  };
}

export function invoicePaidEmail(input: { firstName: string; month: YyyyMm; cents: number; number: string }): Mail {
  return {
    subject: `Your ${monthName(input.month)} pay is on its way: ${fmtMoney(input.cents)}`,
    text: [
      hi(input.firstName),
      "",
      `Your ${monthName(input.month)} pay of ${fmtMoney(input.cents)} has been sent to your bank. It usually shows up within a few business days.`,
      "",
      `Invoice number: ${input.number}`,
      "",
      SYSTEM_FOOTER,
    ].join("\n"),
  };
}

export function disputeResolvedPush(month: YyyyMm, number: string): PushMessage {
  return {
    title: "We looked into your invoice",
    body: `Your ${monthName(month)} invoice question is sorted. Tap to see it.`,
    data: { type: "invoice", number },
  };
}

// ---------------------------------------------------------------- claims, days off

export function bonusDecisionPush(approved: boolean, platform: string): PushMessage {
  const app = platform === "tiktok" ? "TikTok" : "Instagram";
  return approved
    ? { title: "Bonus approved", body: `Your ${app} bonus claim was approved. It's on your next invoice.`, data: { type: "bonus" } }
    : { title: "About your bonus claim", body: `Your ${app} bonus claim wasn't approved. Tap to see why.`, data: { type: "bonus" } };
}

export function dayOffDecisionPush(date: YyyyMmDd, status: "approved" | "declined"): PushMessage {
  return status === "approved"
    ? { title: "Day off approved", body: `You're off on ${fmtShort(date)}. Nothing to post that day.`, data: { type: "day_off", date } }
    : { title: "About your day off", body: `We can't give you ${fmtShort(date)} off. Message us on Slack if you need to talk it through.`, data: { type: "day_off", date } };
}

/** The founder excused a day they missed. */
export function dayExcusedPush(date: YyyyMmDd): PushMessage {
  return { title: "Day excused", body: `We excused ${fmtShort(date)}, so it counts as a day off.`, data: { type: "day_off", date } };
}

export function founderDayOffPush(name: string, date: YyyyMmDd, creatorId: string): { title: string; body: string; data: Record<string, string> } {
  return { title: `${name} asked for a day off`, body: `${fmtWeekdayLong(date)}. Approve or decline in the app.`, data: { type: "founder_day_off", id: creatorId } };
}

// ---------------------------------------------------------------- getting started

/** Shown in the app when warm-up is done but their link isn't in yet. */
export const LINK_WAIT_TEXT = "We're adding your link. Your first posting day starts once it's in your bio.";

/** The founder added their tracking link while they're still setting up. */
export function linkReadyPush(): PushMessage {
  return { title: "Your link is ready", body: "Add it to your TikTok and Instagram bio, then tick it off in the app.", data: { type: "onboarding" } };
}

export function firstDayEvePush(date: YyyyMmDd, videos: number): PushMessage {
  return {
    title: "Tomorrow is your first posting day",
    body: `It's Day 1 of your trial. ${fmtWeekdayLong(date)}: ${videos} videos on TikTok and Instagram by 11:59 PM.`,
    data: { type: "first_day" },
  };
}

export function warmupReminderPush(day: number, of: number): PushMessage {
  if (of === 1) {
    return {
      title: "Your 20-minute warm-up",
      body: "Spend 10 minutes on TikTok and 10 on Instagram with your new accounts, like a real user would, then tick it off.",
      data: { type: "warmup" },
    };
  }
  return {
    title: `Warm-up day ${day} of ${of}`,
    body: "Spend 10 minutes on TikTok and 10 on Instagram, like a real user would, then tick it off.",
    data: { type: "warmup" },
  };
}

// ---------------------------------------------------------------- the end

export function agreementEndedText(endedOn: YyyyMmDd, finalCents: number | null, payBy: YyyyMmDd | null): string {
  const first = `Your contract ended on ${fmtShort(endedOn)}.`;
  if (finalCents === null || finalCents <= 0 || !payBy) return `${first} Your invoices stay here.`;
  return `${first} Final pay ${fmtMoney(finalCents)} arrives by ${fmtShort(payBy)}.`;
}
