// Personal follow-up to Sadiq Hussain re: his App Store review (Aug 3 2026, "SaadSsih").
// Sends via BOTH channels:
//   1. In-app support message (Firestore)
//   2. Email via Google Workspace SMTP
//
// Usage (in-app only, no SMTP creds needed):
//   set -a && source .env.local && set +a && npx tsx scripts/_msg_sadiq_review.ts
//
// Usage (both channels — requires SMTP creds):
//   set -a && source .env.local && set +a
//   export KESHAH_GMAIL_USER="contact@keshah.com"
//   export KESHAH_GMAIL_APP_PASSWORD="xxxxxxxxxxxxxxxx"    # from https://myaccount.google.com/apppasswords
//   npx tsx scripts/_msg_sadiq_review.ts
//
// Add --dry-run to preview without actually sending anything.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UID = "7brsb94d4UTAUkXxQU4GtTwvnxU2";
const EMAIL = "x6zrmccrtw@privaterelay.appleid.com";
const TEAM_FROM_ID = "0";
const DRY_RUN = process.argv.includes("--dry-run");

const MESSAGE =
  `Hey Sadiq - Aadi here, KESHAH Founder - the team shared your app store review with me: I'm sorry to hear that you felt that the oils and needling treatment was required - they are absolutely not. The app and massages generally stop hair loss. For regrowth, microneedling can be added but is completely optional. I understand if this was not clear enough. To make this clearer for future customers we have already added an FAQ section which clearly outlines the optional upgrades during onboarding. As a personal sorry to you, I'm also happy to have you try the regrowth kit on us if that's something you'd be interested in adding. Let me know!`;

const EMAIL_SUBJECT = "Regarding your KESHAH review — from Aadi";

(async () => {
  console.log(DRY_RUN ? "=== DRY RUN — nothing will send ===\n" : "");
  console.log("Message to send:\n");
  console.log(MESSAGE);
  console.log(`\nRecipient: Sadiq Hussain <${EMAIL}>  uid=${UID}\n`);

  // ── 1. In-app support message ────────────────────────────────────────
  if (!DRY_RUN) {
    await db.collection("support").doc(UID).collection("messages").add({
      fromId: TEAM_FROM_ID,
      content: MESSAGE,
      attachments: null,
      feedback: null,
      type: "direct",
      timestamp: Timestamp.now(),
    });
    console.log(`✓ In-app support message posted to support/${UID}/messages`);
  } else {
    console.log(`(would post to support/${UID}/messages)`);
  }

  // ── 2. Email via SMTP ────────────────────────────────────────────────
  const hasSmtp = !!(process.env.KESHAH_GMAIL_USER && process.env.KESHAH_GMAIL_APP_PASSWORD);
  if (!hasSmtp) {
    console.log(`\n⚠ Email NOT sent — SMTP creds not exported.`);
    console.log(`  To send the email too, run:`);
    console.log(`    export KESHAH_GMAIL_USER="contact@keshah.com"`);
    console.log(`    export KESHAH_GMAIL_APP_PASSWORD="<16-char app password>"`);
    console.log(`    npx tsx scripts/_msg_sadiq_review.ts`);
    process.exit(0);
  }

  const nodemailer = await import("nodemailer");
  const t = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.KESHAH_GMAIL_USER,
      pass: process.env.KESHAH_GMAIL_APP_PASSWORD,
    },
  });
  try { await t.verify(); console.log(`\n✓ SMTP auth verified for ${process.env.KESHAH_GMAIL_USER}`); }
  catch (e: any) { console.error(`✗ SMTP auth failed: ${e.message}`); process.exit(1); }

  if (!DRY_RUN) {
    await t.sendMail({
      from: `Aadi from KESHAH <${process.env.KESHAH_GMAIL_USER}>`,
      to: EMAIL,
      subject: EMAIL_SUBJECT,
      text: MESSAGE,
    });
    console.log(`✓ Email sent to ${EMAIL}`);
  } else {
    console.log(`(would email ${EMAIL} — subject: "${EMAIL_SUBJECT}")`);
  }

  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
