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
  const text = [
    `Hi ${first},`,
    "",
    "Congratulations! We've decided to move forward with you for the content creator role at KESHAH. We've reviewed over 250 applications and yours stood out. Fewer than 6% of applicants get into our creator program, so we're excited to have you on board.",
    "",
    ...(input.deadlineText ? [`Please sign your agreement by ${input.deadlineText} to confirm your spot.`, ""] : []),
    "How to get started",
    "",
    ...(app
      ? [
          `1. Install the KESHAH Creators app: ${app}`,
          "   (It's on TestFlight, Apple's app for new apps. Install TestFlight if it asks, then tap Install.)",
          `2. Sign in with ${input.signInEmail || "the email this message was sent to"}`,
        ]
      : [`1. Set your password (this link works once and expires in 7 days): ${input.link}`, "2. Sign in with this email address"]),
    input.contractReady
      ? "3. Sign your agreement. It's the first step in the app, and the app walks you through the rest."
      : "3. Sign your agreement. It'll be the first step in the app shortly, and the app walks you through the rest.",
    "",
    "The role",
    "",
    "• 1-month paid trial: 20 posting days, 3 videos a weekday, $300 total ($15 for each full day)",
    "• If you pass your trial: 5 videos a weekday, $500/month to start, growing to $1,100, plus bonuses ($15 when a video hits 100K views, $100 total at 1M)",
    "",
    "Any questions, just reply to this email.",
    "",
    CREATOR_SIGNOFF,
  ].join("\n");
  // Kept for callers that expect html; sent as plain text so it reads like a
  // personal email and lands in Primary.
  const html = `<pre style="font-family:inherit;white-space:pre-wrap">${esc(text)}</pre>`;
  return { subject: "Your offer from KESHAH", text, html };
}
