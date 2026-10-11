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
}): {
  subject: string;
  text: string;
  html: string;
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
      `• ${input.contractReady ? "Your new agreement is waiting in the app for you to sign." : "Your new agreement will be in the app shortly for you to sign."}`,
      "• You'll also be asked to add your payment details and tax form so we can pay you.",
      "",
      "Let me know if anything is unclear. Just reply to this email.",
      "",
      "Best,",
      CREATOR_SIGNOFF,
    ].join("\n");
    return { subject: "Your KESHAH Creators app", text, html: `<pre style="font-family:inherit;white-space:pre-wrap">${esc(text)}</pre>` };
  }
  const app = creatorAppUrl();
  // The @keshah.com address isn't in this email on purpose: the app's Accounts
  // step shows it when they need it, with how to use it.
  //
  // Light HTML (bold + one text link) with a plain-text copy alongside. No
  // images, tracking or footer, so it still reads like a personal email and
  // lands in Primary.
  const opener =
    "Congratulations! We've decided to move forward with you for the content creator role at KESHAH. We've reviewed over 250 applications and yours stood out. Fewer than 6% of applicants get into our creator program, so we're excited to have you on board.";
  const deadline = input.deadlineText ? `Please sign your agreement by ${input.deadlineText} to confirm your spot.` : null;
  const signIn = input.signInEmail || "the email this message was sent to";
  const step3 = input.contractReady
    ? "Sign your agreement. It's the first step in the app, and the app walks you through the rest."
    : "Sign your agreement. It'll be the first step in the app shortly, and the app walks you through the rest.";
  const trial = "20 posting days, 3 videos a weekday, $300 total";
  const after = "5 videos a weekday, $500/month to start, growing to $1,100, plus bonuses ($15 when a video hits 100K views, $100 total at 1M)";
  const closing = "We are excited to have you on the team. If you have any questions, feel free to reply to this email.";

  const text = [
    `Hi ${first},`,
    "",
    opener,
    "",
    ...(deadline ? [deadline, ""] : []),
    "How to get started",
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
    `• 1-month paid trial: ${trial}`,
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
    `<p style="margin:0 0 6px"><b>How to get started</b></p>`,
    `<ol style="margin:0 0 16px;padding-left:20px">`,
    `<li style="margin-bottom:6px">${step1}</li>`,
    `<li style="margin-bottom:6px">Sign in with ${esc(signIn)}</li>`,
    `<li>${esc(step3)}</li>`,
    `</ol>`,
    `<p style="margin:0 0 6px"><b>The role</b></p>`,
    `<ul style="margin:0 0 16px;padding-left:20px">`,
    `<li style="margin-bottom:6px"><b>1-month paid trial:</b> ${esc(trial)}</li>`,
    `<li><b>If you pass your trial:</b> ${esc(after)}</li>`,
    `</ul>`,
    p(esc(closing)),
    `<p style="margin:0">${esc(CREATOR_SIGNOFF).replace(/\n/g, "<br>")}</p>`,
    `</div>`,
  ].join("");
  return { subject: "Your offer from KESHAH", text, html };
}

/**
 * Light HTML for creator emails (same look as the offer email): paragraphs,
 * optional bold, McKenzie's sign-off. No images or tracking. Send the plain
 * text alongside.
 */
export function lightEmailHtml(paragraphs: { text: string; bold?: boolean }[]): string {
  const p = (inner: string) => `<p style="margin:0 0 16px">${inner}</p>`;
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">`,
    ...paragraphs.map((x) => p(x.bold ? `<b>${esc(x.text)}</b>` : esc(x.text))),
    `<p style="margin:0">${esc(CREATOR_SIGNOFF).replace(/\n/g, "<br>")}</p>`,
    `</div>`,
  ].join("");
}
