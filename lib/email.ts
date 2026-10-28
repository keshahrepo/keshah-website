// Transactional email via the KESHAH Gmail account (same SMTP setup the
// outreach scripts in scripts/_msg_*.ts use). Needs two env vars:
//   KESHAH_GMAIL_USER          e.g. contact@keshah.com
//   KESHAH_GMAIL_APP_PASSWORD  a Google app password for that account

import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

export function emailConfigured(): boolean {
  return !!(process.env.KESHAH_GMAIL_USER && process.env.KESHAH_GMAIL_APP_PASSWORD);
}

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.KESHAH_GMAIL_USER,
        pass: process.env.KESHAH_GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
  /** Display name on the From line. Defaults to "Aadi from KESHAH". */
  fromName?: string;
  /** Reply in an existing thread: the Message-ID being answered (and the thread's IDs). */
  inReplyTo?: string;
  references?: string[];
}): Promise<void> {
  if (!emailConfigured()) {
    throw new Error("Email not configured (KESHAH_GMAIL_USER / KESHAH_GMAIL_APP_PASSWORD).");
  }
  await getTransporter().sendMail({
    from: `${opts.fromName ?? "Aadi from KESHAH"} <${process.env.KESHAH_GMAIL_USER}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
    ...(opts.inReplyTo ? { inReplyTo: opts.inReplyTo, references: opts.references?.length ? opts.references : [opts.inReplyTo] } : {}),
  });
}
