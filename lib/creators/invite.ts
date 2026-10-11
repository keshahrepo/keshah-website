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
  const contractStep = input.contractReady
    ? "Sign the agreement. It's the first step in the app, and it takes a couple of minutes."
    : "Sign the agreement. It'll be the first step in the app shortly, and you'll sign it right there.";
  const text = [
    `Hi ${first},`,
    "",
    "Congratulations! We've decided to move forward with you for the content creator role at KESHAH. Your application stood out, and with a 5.7% acceptance rate for our creator program, we're excited to have you on board.",
    "",
    "Quick recap of the role:",
    "",
    "• On-camera content creator. You'll film and post short videos every weekday to KESHAH-owned TikTok and Instagram accounts.",
    "• Weekdays only (Mon to Fri), and you choose your own filming hours.",
    "• You start with a paid trial: your first 20 posting days, 3 videos a day. You get $15 for every day you post all 3, so $300 for the full trial.",
    "• After your 20th day, we look at your trial. If you pass, you move up to 5 videos a day and $500 a month to start, growing to $1,100 the longer you're with us. Plus view bonuses on each video: $15 at 100K views, $100 total at 1M, within 30 days of posting.",
    "• We give you proven videos to remake, scripts and direction. You bring the energy.",
    "",
    "Our best creators can also be invited to become Format Creators, inventing the new formats everyone else uses.",
    "",
    ...(app
      ? [
          "Everything happens in the KESHAH Creators app. It's in early access, so it's on TestFlight, Apple's app for new apps. Tap the link, install TestFlight if it asks, then tap Install:",
          app,
          input.signInEmail ? `Then sign in with ${input.signInEmail}, the email this message was sent to.` : "Then sign in with the email this message was sent to.",
          "",
        ]
      : ["Everything happens in your KESHAH Creators account. First, set your password (this link works once and expires in 7 days):", input.link, ""]),
    ...(input.keshahEmail
      ? [
          `We've also set up ${input.keshahEmail} for you. You'll use it to create your KESHAH TikTok and Instagram accounts, and anything sent to it, like verification codes, also lands in this inbox.`,
          "",
        ]
      : []),
    ...(input.deadlineText ? [`Please sign your agreement in the app by ${input.deadlineText} to confirm your spot.`, ""] : []),
    "Next steps:",
    "",
    app ? `1. Install KESHAH Creators from the TestFlight link above and sign in with ${input.signInEmail || "this email address"}.` : "1. Set your password and sign in.",
    `2. ${contractStep}`,
    "3. Go through the Getting started steps. They cover Slack, setting up your accounts and your first 3 days.",
    "",
    "Let me know if anything is unclear. Just reply to this email.",
    "",
    "Looking forward to having you on the KESHAH team!",
    "",
    "Best,",
    CREATOR_SIGNOFF,
  ].join("\n");
  // Kept for callers that expect html; sent as plain text so it reads like a
  // personal email and lands in Primary.
  const html = `<pre style="font-family:inherit;white-space:pre-wrap">${esc(text)}</pre>`;
  return { subject: "Your offer from KESHAH", text, html };
}
