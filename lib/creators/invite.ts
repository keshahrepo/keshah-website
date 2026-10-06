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
  if (!invite?.token_hash) return "This link isn't valid. Ask Aadi for a new one.";
  if (invite.used_at) return "This link was already used. Log in with your password, or ask Aadi for a new link.";
  if (!invite.expires_at || Date.parse(invite.expires_at) <= now.getTime()) return "This link has expired. Ask Aadi for a new one.";
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

export function welcomeEmail(input: { firstName: string; link: string; keshahEmail?: string; contractReady: boolean }): {
  subject: string;
  text: string;
  html: string;
} {
  const first = input.firstName || "there";
  const contractLine = input.contractReady
    ? "Sign your contract. It's the first thing you'll see in the portal, and it only takes a couple of minutes."
    : "Sign your contract. I'll have it in your portal shortly, and you'll sign it right there.";
  const inboxLine = input.keshahEmail
    ? `I also set up ${input.keshahEmail} for you. Use it when you make your KESHAH TikTok and Instagram accounts. Anything sent to it, like verification codes, comes straight to this inbox.`
    : "";
  const steps = [
    "Set your password and log in.",
    contractLine,
    "Go through the Getting started steps. They walk you through everything, from setting up your accounts to your first post.",
  ];

  const text = [
    `Hey ${first},`,
    "",
    "It's Aadi from KESHAH. You're in, and I'm really glad to have you on the team.",
    "",
    "First, set a password for your creator portal. This link works once and expires in 7 days:",
    input.link,
    "",
    ...(inboxLine ? [inboxLine, ""] : []),
    "Here's what happens next:",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "If anything's unclear, just reply to this email.",
    "",
    "Aadi",
  ].join("\n");

  const p = (s: string) => `<p style="margin:0 0 16px">${s}</p>`;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:520px">
${p(`Hey ${esc(first)},`)}
${p("It's Aadi from KESHAH. You're in, and I'm really glad to have you on the team.")}
${p("First, set a password for your creator portal. This link works once and expires in 7 days.")}
<p style="margin:0 0 24px"><a href="${esc(input.link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">Set your password</a></p>
${inboxLine ? p(esc(inboxLine)) : ""}
${p("Here's what happens next:")}
<ol style="margin:0 0 16px;padding-left:20px">${steps.map((s) => `<li style="margin-bottom:6px">${esc(s)}</li>`).join("")}</ol>
${p("If anything's unclear, just reply to this email.")}
${p("Aadi")}
<p style="margin:24px 0 0;font-size:12px;color:#888">If the button doesn't work, paste this into your browser:<br>${esc(input.link)}</p>
</div>`;

  return { subject: `${first === "there" ? "Your" : `${first}, your`} KESHAH creator portal`, text, html };
}
