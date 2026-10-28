/**
 * Portal invite: single-use set-password tokens + the welcome email.
 *
 * Only the SHA-256 of the token is stored (ContentCreators/{id}.invite); the
 * raw token exists in the emailed link and, once, in the admin Accept
 * response so the founder can send it by hand. Pure helpers, no Firestore.
 */
import { createHash, randomBytes } from "crypto";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

/** Stored on ContentCreators/{id}.invite. */
export interface CreatorInvite {
  token_hash: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newInvite(now: Date = new Date()): { token: string; invite: CreatorInvite } {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    invite: {
      token_hash: hashInviteToken(token),
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
      used_at: null,
    },
  };
}

/** Why an invite can't be used, or null when it's fine. */
export function inviteProblem(invite: Partial<CreatorInvite> | null | undefined, now: Date = new Date()): string | null {
  if (!invite?.token_hash) return "This link isn't valid. Ask McKenzie for a new one.";
  if (invite.used_at) return "This link was already used. Log in with your password, or ask McKenzie for a new link.";
  if (!invite.expires_at || Date.parse(invite.expires_at) <= now.getTime()) return "This link has expired. Ask McKenzie for a new one.";
  return null;
}

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw.length > 200) return "That password is too long.";
  return null;
}

export function setPasswordUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/creator/set-password?token=${encodeURIComponent(token)}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Creator-program emails come from the creator coordinator. */
export const CREATOR_FROM_NAME = "McKenzie from KESHAH";
export const CREATOR_SIGNOFF = "McKenzie\nCreator Coordinator, KESHAH";

/** The pay lines in offer emails (Oct 2026 plans). */
export const TRIAL_TEXT = "your first 20 posting days, 3 videos a weekday, $600";
/** The plan an offer names. format: a Format Creator (by invitation, 2 of the videos in their own style). */
export interface OfferPlan {
  videos: number;
  baseCents: number;
  format?: boolean;
}

/** "5 videos a weekday, $1,000/month, plus bonuses (...)" for one plan ("Format Creator plan: ..." for Format). */
export function afterTrialText(plan: OfferPlan): string {
  const usd = `$${(plan.baseCents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const videos = plan.format ? `Format Creator plan: ${plan.videos} videos a weekday (2 of them in your own style)` : `${plan.videos} videos a weekday`;
  return `${videos}, ${usd}/month, plus bonuses ($15 when a video hits 100K views, $100 total at 1M)`;
}

export const AFTER_TRIAL_TEXT =
  "5 videos a weekday for $1,000/month, or 3 a weekday for $600/month, plus bonuses ($15 when a video hits 100K views, $100 total at 1M)";

/** The founder's 15-min kickoff booking link (Calendly). Set: the offer email asks them to book it instead of doing setup alone. */
export function creatorKickoffUrl(): string | null {
  const u = process.env.CREATOR_KICKOFF_URL?.trim();
  return u && /^https:\/\//.test(u) ? u : null;
}

/** The KESHAH Creators app link for acceptance emails (TestFlight now, App Store later). Unset: the web portal. */
export function creatorAppUrl(): string | null {
  const u = process.env.CREATOR_APP_URL?.trim();
  return u && /^https:\/\//.test(u) ? u : null;
}

export function welcomeEmail(input: {
  firstName: string;
  link: string;
  keshahEmail?: string;
  /** The personal address the email goes to, which is the one they sign in to the app with. */
  signInEmail?: string;
  contractReady: boolean;
  /** Already working with us (e.g. moved over from the old setup): portal intro, not an offer. */
  existing?: boolean;
  /** The contract deadline as text, e.g. "Tuesday, October 14 at 11:59 PM ET" (lib/creators/deadline.ts deadlineLong). New offers only. */
  deadlineText?: string;
  /** The kickoff booking link (default: CREATOR_KICKOFF_URL). Null: the self-serve offer. */
  kickoffUrl?: string | null;
  /** Their plan after the trial: the email names just this one. Unset: both standard plans. */
  plan?: OfferPlan;
}): {
  subject: string;
  text: string;
  html: string;
  /** Who it should come from (the founder for a kickoff offer). */
  fromName: string;
} {
  const first = input.firstName || "there";
  if (input.existing) {
    const existingApp = creatorAppUrl();
    const text = [
      `Hi ${first},`,
      "",
      "We've built the KESHAH Creators app, and your account is ready. It's where you'll see your videos, your pay for the month, your bonuses and your invoices, all in one place.",
      "",
      ...(existingApp
        ? [
            "It's in early access, so it's on TestFlight, Apple's app for new apps. Tap the link, install TestFlight if it asks, then tap Install:",
            existingApp,
            input.signInEmail ? `Then sign in with ${input.signInEmail}, the email this message was sent to.` : "Then sign in with the email this message was sent to.",
          ]
        : ["First, set your password (this link works once and expires in 7 days):", input.link]),
      "",
      "A few things to know:",
      "",
      "• Your videos show up in the app on their own within a few hours of posting. If one is missing near the deadline, you can paste its link.",
      "• Bonuses are added automatically when a video passes 100K views ($15) or 1M views ($100 total), within 30 days of posting.",
      `• ${input.contractReady ? "Your new contract is waiting in the app for you to sign." : "Your new contract will be in the app shortly for you to sign."}`,
      "• You'll also be asked to add your payment details and tax form so we can pay you.",
      "",
      "Let me know if anything is unclear. Just reply to this email.",
      "",
      "Best,",
      CREATOR_SIGNOFF,
    ].join("\n");
    return { subject: "Your KESHAH Creators app", text, html: `<pre style="font-family:inherit;white-space:pre-wrap">${esc(text)}</pre>`, fromName: CREATOR_FROM_NAME };
  }
  const app = creatorAppUrl();
  const kickoff = input.kickoffUrl === undefined ? creatorKickoffUrl() : input.kickoffUrl;
  const afterText = input.plan ? afterTrialText(input.plan) : AFTER_TRIAL_TEXT;
  if (kickoff) return kickoffOfferEmail(first, app, input.link, input.signInEmail, input.deadlineText, afterText, !!input.plan?.format);
  // The @keshah.com address isn't in this email on purpose: the app's Accounts
  // step shows it when they need it, with how to use it.
  //
  // Light HTML (bold + one text link) with a plain-text copy alongside. No
  // images, tracking or footer, so it still reads like a personal email and
  // lands in Primary.
  const opener =
    "Congratulations! We've decided to move forward with you for the content creator role at KESHAH. We've reviewed over 250 applications and yours stood out. Fewer than 6% of applicants get into our creator program, so we're excited to have you on board.";
  const deadline = input.deadlineText ? `Please sign your contract by ${input.deadlineText} to confirm your spot.` : null;
  const signIn = input.signInEmail || "the email this message was sent to";
  const step3 = input.contractReady
    ? "Sign your contract. It's the first step in the app, and the app walks you through the rest."
    : "Sign your contract. It'll be the first step in the app shortly, and the app walks you through the rest.";
  const trial = TRIAL_TEXT;
  const after = afterText;
  const closing = "We are excited to have you on the team. If you have any questions, feel free to reply to this email.";

  const text = [
    `Hi ${first},`,
    "",
    opener,
    "",
    ...(deadline ? [deadline, ""] : []),
    "Next steps",
    "",
    ...(app
      ? [
          `1. Download the KESHAH Creators app: ${app}`,
          "   It's in early access through TestFlight, Apple's app for early access, so install TestFlight first if it asks.",
          `2. Sign in with ${signIn}`,
        ]
      : [`1. Set your password (this link works once and expires in 7 days): ${input.link}`, "2. Sign in with this email address"]),
    `3. ${step3}`,
    "",
    "The role",
    "",
    `• Paid trial: ${trial}`,
    `• If you pass your trial: ${after}`,
    "",
    closing,
    "",
    CREATOR_SIGNOFF,
  ].join("\n");

  const p = (inner: string) => `<p style="margin:0 0 16px">${inner}</p>`;
  const step1 = app
    ? `Download the <a href="${esc(app)}">KESHAH Creators app</a>. It's in early access through TestFlight, Apple's app for early access, so install TestFlight first if it asks.`
    : `Set your password (this link works once and expires in 7 days): <a href="${esc(input.link)}">set your password</a>.`;
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">`,
    p(`Hi ${esc(first)},`),
    p(esc(opener)),
    deadline ? p(`<b>${esc(deadline)}</b>`) : "",
    `<p style="margin:0 0 6px"><b>Next steps</b></p>`,
    `<ol style="margin:0 0 16px;padding-left:20px">`,
    `<li style="margin-bottom:6px">${step1}</li>`,
    `<li style="margin-bottom:6px">Sign in with ${esc(signIn)}</li>`,
    `<li>${esc(step3)}</li>`,
    `</ol>`,
    `<p style="margin:0 0 6px"><b>The role</b></p>`,
    `<ul style="margin:0 0 16px;padding-left:20px">`,
    `<li style="margin-bottom:6px"><b>Paid trial:</b> ${esc(trial)}</li>`,
    `<li><b>If you pass your trial:</b> ${esc(after)}</li>`,
    `</ul>`,
    p(esc(closing)),
    `<p style="margin:0">${esc(CREATOR_SIGNOFF).replace(/\n/g, "<br>")}</p>`,
    `</div>`,
  ].join("");
  return { subject: "Your offer from KESHAH", text, html, fromName: CREATOR_FROM_NAME };
}

/**
 * The offer when there's a call with Aadi: download the app, sign the
 * contract in it, then book the call from the app (accounts and warm-up can
 * go ahead before the call).
 */
function kickoffOfferEmail(
  first: string,
  app: string | null,
  setPasswordLink: string,
  signInEmail?: string,
  deadlineText?: string,
  afterText: string = AFTER_TRIAL_TEXT,
  format = false,
): { subject: string; text: string; html: string; fromName: string } {
  const opener = format
    ? "Thanks for chatting with Aadi! We'd love to have you on board as one of our Format Creators, by invitation only."
    : "Thanks for chatting with Aadi! We'd love to have you on board as a KESHAH creator.";
  const deadline = deadlineText ? `Please sign your contract by ${deadlineText} to confirm your spot.` : null;
  const signIn = signInEmail ? `Then sign in with ${signInEmail}, the email this message was sent to.` : "Then sign in with the email this message was sent to.";
  const step1 = app
    ? `Download the KESHAH Creators app. It's in early access, so it's on TestFlight, Apple's app for early access. Tap the link, install TestFlight if it asks, then tap Install: ${app}`
    : `Set your password for the KESHAH Creators app (this link works once and expires in 7 days): ${setPasswordLink}`;
  const step2 = "Read and sign your contract in the app.";
  const step3 = "Book a 15-minute call with Aadi right in the app. You can set up your accounts before the call, and we'll go over anything you're stuck on.";
  const closing = "We're excited to have you on the team. If you have any questions, just reply to this email.";
  const text = [
    `Hi ${first},`,
    "",
    opener,
    "",
    ...(deadline ? [deadline, ""] : []),
    "Next steps",
    "",
    `1. ${step1}`,
    ...(app ? [`   ${signIn}`] : []),
    `2. ${step2}`,
    `3. ${step3}`,
    "",
    "The role",
    "",
    `• Paid trial: ${TRIAL_TEXT}`,
    `• If you pass your trial: ${afterText}`,
    "",
    closing,
    "",
    CREATOR_SIGNOFF,
  ].join("\n");
  const p = (inner: string) => `<p style="margin:0 0 16px">${inner}</p>`;
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">`,
    p(`Hi ${esc(first)},`),
    p(esc(opener)),
    deadline ? p(`<b>${esc(deadline)}</b>`) : "",
    `<p style="margin:0 0 6px"><b>Next steps</b></p>`,
    `<ol style="margin:0 0 16px;padding-left:20px">`,
    app
      ? `<li style="margin-bottom:6px">Download the <a href="${esc(app)}">KESHAH Creators app</a>. It's in early access, so it's on TestFlight, Apple's app for early access. Tap the link, install TestFlight if it asks, then tap Install. ${esc(signIn)}</li>`
      : `<li style="margin-bottom:6px"><a href="${esc(setPasswordLink)}">Set your password</a> for the KESHAH Creators app (this link works once and expires in 7 days).</li>`,
    `<li style="margin-bottom:6px">${esc(step2)}</li>`,
    `<li>${esc(step3)}</li>`,
    `</ol>`,
    `<p style="margin:0 0 6px"><b>The role</b></p>`,
    `<ul style="margin:0 0 16px;padding-left:20px">`,
    `<li style="margin-bottom:6px"><b>Paid trial:</b> ${esc(TRIAL_TEXT)}</li>`,
    `<li><b>If you pass your trial:</b> ${esc(afterText)}</li>`,
    `</ul>`,
    p(esc(closing)),
    `<p style="margin:0">${esc(CREATOR_SIGNOFF).replace(/\n/g, "<br>")}</p>`,
    `</div>`,
  ].join("");
  return { subject: "Your offer from KESHAH", text, html, fromName: CREATOR_FROM_NAME };
}

/**
 * Light HTML for creator emails (same look as the offer email): paragraphs,
 * optional bold, McKenzie's sign-off. No images or tracking. Send the plain
 * text alongside.
 */
export function lightEmailHtml(paragraphs: { text: string; bold?: boolean }[], signoff: string = CREATOR_SIGNOFF): string {
  const p = (inner: string) => `<p style="margin:0 0 16px">${inner}</p>`;
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">`,
    ...paragraphs.map((x) => p(x.bold ? `<b>${esc(x.text)}</b>` : esc(x.text))),
    `<p style="margin:0">${esc(signoff).replace(/\n/g, "<br>")}</p>`,
    `</div>`,
  ].join("");
}
