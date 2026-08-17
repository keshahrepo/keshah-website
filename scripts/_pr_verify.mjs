// Send the REAL journalist pitch (with a real first name from the CSV)
// to yourself, so you see exactly what recipients will get.
import nodemailer from "nodemailer";

const t = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

await t.verify();
console.log("✓ Gmail auth verified");

// Real example from the journalist CSV
const firstName = "Kelsey";

const subject = "I solved balding without drugs";
const body = `Hey ${firstName},

i'm Aadi, three things:

- I was balding at 19 and solved it for myself without drugs (its called mechanical therapy - think a workout, but for your scalp)

- I have a 70k+ tiktok community (20M+ views) and our keshah app has 40,000+ members (some crazy before and afters and many video testimonials).

- I'm an engineer (not a doctor) - we have data that shows that a mechanical approach works for those who can follow it consistently.

I'd love to share how I solved balding without drugs. Lmk if interested.

Sincerely,
Aadi
Founder, KESHAH
UC Berkeley EECS
www.keshah.com`;

const info = await t.sendMail({
  from: `Aadi from KESHAH <${process.env.GMAIL_USER}>`,
  to: process.env.GMAIL_USER,
  subject: `[TEST → would go to Kelsey at Men's Journal] ${subject}`,
  text: body,
});

console.log("✓ Sent. Check your inbox — Kelsey is a real first name from the CSV.");
console.log("Message ID:", info.messageId);
