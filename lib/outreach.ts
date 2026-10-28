/**
 * TikTok outreach pipeline (the only recruiting channel from Oct 2026).
 *
 * Every creator we email is a careers_applications doc with source
 * "tiktok-outreach", so the founder app's Recruit tab is one list:
 *
 *   emailed    we emailed them, no reply yet        (status "emailed")
 *   replied    they replied: send the calendar link (status "replied", set by the reply sync)
 *   invited    calendar sent, not booked yet        (status "invited", set when the founder's Gmail reply has the Calendly link)
 *   booked     call coming up                       (status "booked", set by the Calendly webhook)
 *   called     call is over: Accept or Pass         (status "booked", call start + 20 min has passed; no test video step)
 *   review     test video in: Accept or Pass        (interview_video_submitted_at)
 *   offered    accepted, setup not started          (creator: contract not signed)
 *   onboarding signed, setting up and warming up    (creator: no start_date yet)
 *   posting    first post done                      (creator: start_date)
 *   passed     not moving forward                   (status "denied")
 *
 * Pure helpers here (tests: outreach.test.ts); Firestore and Gmail in outreach-db.ts.
 */

export const OUTREACH_SOURCE = "tiktok-outreach";

export type RecruitStage = "emailed" | "replied" | "invited" | "booked" | "called" | "review" | "offered" | "onboarding" | "posting" | "passed" | "applied";

/** The creator a decided application became (ContentCreators, matched by application_id). */
export interface CreatorLite {
  contract_signed: boolean;
  started: boolean;
  status: string;
}

/** A 15-minute call, plus a little slack, before it counts as over. */
export const CALL_OVER_MS = 20 * 60_000;

/** Is their booked call over (start + 20 min passed)? False with no call time. */
export function callOver(app: Record<string, unknown>, now = Date.now()): boolean {
  const start = Date.parse(String(app.calendly_event_start_time ?? ""));
  return Number.isFinite(start) && start + CALL_OVER_MS <= now;
}

export function recruitStage(app: Record<string, unknown>, creator?: CreatorLite | null, now = Date.now()): RecruitStage {
  const status = String(app.status ?? "");
  if (status === "denied" || status === "rejected" || status === "withdrawn") return "passed";
  if (status === "accepted") {
    if (creator?.status === "ended" || creator?.status === "cut") return "passed";
    if (creator?.started) return "posting";
    if (creator?.contract_signed) return "onboarding";
    return "offered";
  }
  if (app.interview_video_submitted_at) return "review";
  if (status === "booked" || status === "completed") return callOver(app, now) ? "called" : "booked";
  if (status === "replied") return "replied";
  if (status === "invited") return "invited";
  if (status === "emailed") return "emailed";
  return "applied";
}

/** The interview booking page. */
export const INTERVIEW_CALENDLY_URL = "https://calendly.com/aadi-keshah/creator-interview";

/** The first few lines of a reply, without the quoted email under it. */
export function replySnippet(text: string): string {
  const cut = text.split(/\r?\n(?:On .{5,120}wrote:|-{2,}\s*Original Message|From: )/)[0] ?? "";
  const lines = cut
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith(">"))
    .join(" ");
  return lines.replace(/\s+/g, " ").trim().slice(0, 400);
}

/** Lowercased address out of "Name <a@b.com>" or "a@b.com". */
export function addressOf(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

/** The first outreach email (from Aadi). `line` = "I came across your … That's exactly what we look for." */
export const FIRST_EMAIL_SUBJECT = "Paid collab, $600/month";

export function firstOutreachEmail(greet: string, line: string): { subject: string; text: string } {
  return {
    subject: FIRST_EMAIL_SUBJECT,
    text: [
      greet.trim() || "Hey,",
      "",
      `I'm Aadi, founder of KESHAH, a hair care app. ${line.trim()}`,
      "",
      "We're hiring a few creators to film short talking videos. You'd post them on new TikTok and Instagram accounts we set up, so nothing goes on your own page. It takes our creators about an hour a day, and pay starts at $600/month plus bonuses.",
      "",
      "Would you be up for a 15-min call this week to hear more? Feel free to reply here and I can share my calendar.",
      "",
      "Aadi",
      "Founder, KESHAH \u00b7 UC Berkeley EECS",
    ].join("\n"),
  };
}
