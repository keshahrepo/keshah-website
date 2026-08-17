// Paced PR pitch sender for KESHAH.
//
// Sends Aadi's podcast/journalist pitch via Gmail SMTP at a safe cadence
// (10-15/day, randomized delays) to keep domain reputation intact.
//
// Setup (one-time):
//   1. Generate a Gmail App Password — google.com → Account → Security →
//      2-Step Verification → App passwords → generate "Mail" password.
//      Copy the 16-char password.
//   2. Export the App Password and your Gmail address:
//        export GMAIL_USER="aaditya.agrawal36@gmail.com"
//        export GMAIL_APP_PASSWORD="xxxxxxxxxxxxxxxx"
//
// Run:
//   node scripts/_pr_sender.mjs --csv /tmp/podcasts_clean.csv --kind podcast
//   node scripts/_pr_sender.mjs --csv /tmp/journalists_bylines.csv --kind journalist
//
// Optional flags:
//   --per-day N       max sends per day (default 15)
//   --min-gap M       min minutes between sends (default 25)
//   --max-gap M       max minutes between sends (default 90)
//   --dry-run         print emails without sending
//   --limit N         only process first N rows
//
// State:
//   Tracks sent emails in /tmp/_pr_sent.json so re-running picks up where
//   it left off. Safe to kill + restart.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import nodemailer from "nodemailer";

const args = (() => {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith("--")) {
      const key = k.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) a[key] = true;
      else { a[key] = next; i++; }
    }
  }
  return a;
})();

const CSV = args.csv;
const KIND = args.kind || "podcast"; // podcast | journalist
const PER_DAY = parseInt(args["per-day"] || "15", 10);
const MIN_GAP = parseInt(args["min-gap"] || "25", 10);
const MAX_GAP = parseInt(args["max-gap"] || "90", 10);
const DRY_RUN = !!args["dry-run"];
const LIMIT = args.limit ? parseInt(args.limit, 10) : Infinity;
const STATE_FILE = "/tmp/_pr_sent.json";

if (!CSV) { console.error("Missing --csv"); process.exit(1); }
if (!DRY_RUN && (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD)) {
  console.error("Missing GMAIL_USER or GMAIL_APP_PASSWORD env vars.");
  console.error("Generate an App Password at: https://myaccount.google.com/apppasswords");
  process.exit(1);
}

// --- CSV parse ---
function parseCsv(text) {
  const lines = text.split("\n").filter(Boolean);
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = parseLine(l);
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i] || ""));
    return row;
  });
}
function parseLine(l) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (inQ) {
      if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// --- Pitch templates ---
const PITCH_PODCAST = ({ firstName }) => ({
  subject: "I solved balding without drugs",
  body: `Hey${firstName ? " " + firstName : ""},

i'm Aadi, three things:

- I was balding at 19 and solved it for myself without drugs (its called mechanical therapy - think a workout, but for your scalp)

- I have a 70k+ tiktok community (20M+ views) and our keshah app has 40,000+ members (some crazy before and afters and many video testimonials).

- I'm an engineer (not a doctor) - we have data that shows that a mechanical approach works for those who can follow it consistently.

I'd love to hop on the podcast and share how I solved balding without drugs. Lmk if interested.

Sincerely,
Aadi
Founder, KESHAH
UC Berkeley EECS
www.keshah.com`,
});

const PITCH_JOURNALIST = ({ firstName }) => ({
  subject: "I solved balding without drugs",
  body: `Hey${firstName ? " " + firstName : ""},

i'm Aadi, three things:

- I was balding at 19 and solved it for myself without drugs (its called mechanical therapy - think a workout, but for your scalp)

- I have a 70k+ tiktok community (20M+ views) and our keshah app has 40,000+ members (some crazy before and afters and many video testimonials).

- I'm an engineer (not a doctor) - we have data that shows that a mechanical approach works for those who can follow it consistently.

I'd love to share how I solved balding without drugs. Lmk if interested.

Sincerely,
Aadi
Founder, KESHAH
UC Berkeley EECS
www.keshah.com`,
});

function firstNameFrom(row) {
  // CSV column varies: artist (podcast), name (journalist)
  const raw = (row.artist || row.name || row.author || "").trim();
  if (!raw) return null;
  const first = raw.split(/\s+/)[0];
  // Reject if it's clearly not a person ("The X Podcast" etc.)
  if (/^the$/i.test(first)) return null;
  if (first.length < 2) return null;
  return first;
}

// --- State ---
function loadState() {
  if (!existsSync(STATE_FILE)) return { sent: {}, dayCounts: {} };
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return { sent: {}, dayCounts: {} }; }
}
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function todayKey() { return new Date().toISOString().split("T")[0]; }

// --- Main ---
(async () => {
  const rows = parseCsv(readFileSync(CSV, "utf8"));
  const emailCol = rows[0]?.email_guess != null ? "email_guess" : "email";
  const recipients = rows.filter((r) => r[emailCol]).slice(0, LIMIT);
  console.log(`Loaded ${recipients.length} recipients from ${CSV} (email col: ${emailCol})`);

  const state = loadState();
  const remaining = recipients.filter((r) => !state.sent[r[emailCol]]);
  console.log(`Already sent: ${recipients.length - remaining.length}, remaining: ${remaining.length}`);

  if (remaining.length === 0) { console.log("Nothing to do."); process.exit(0); }

  let transporter = null;
  if (!DRY_RUN) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    try { await transporter.verify(); console.log("✓ Gmail auth verified\n"); }
    catch (e) { console.error("Gmail auth failed:", e.message); process.exit(1); }
  } else { console.log("(DRY RUN — nothing will actually send)\n"); }

  const template = KIND === "journalist" ? PITCH_JOURNALIST : PITCH_PODCAST;

  let i = 0;
  for (const r of remaining) {
    const today = todayKey();
    state.dayCounts[today] = state.dayCounts[today] || 0;
    if (state.dayCounts[today] >= PER_DAY) {
      console.log(`\nDaily cap of ${PER_DAY} reached for ${today}.`);
      console.log(`Resume tomorrow — script will auto-skip already-sent.`);
      const tomorrow = new Date(Date.now() + 86400000 - (Date.now() % 86400000));
      const waitMs = tomorrow.getTime() - Date.now();
      console.log(`Sleeping ${Math.round(waitMs / 1000 / 60)} min until next day...`);
      await new Promise((res) => setTimeout(res, waitMs));
      continue;
    }

    const firstName = firstNameFrom(r);
    const email = r[emailCol];
    const { subject, body } = template({ firstName });
    i++;

    if (DRY_RUN) {
      console.log(`[${i}/${remaining.length}] → ${email}  (${firstName || "no firstname"})`);
      console.log(`     subject: ${subject}\n`);
    } else {
      try {
        await transporter.sendMail({
          from: `Aadi from KESHAH <${process.env.GMAIL_USER}>`,
          to: email,
          subject,
          text: body,
        });
        state.sent[email] = { sentAt: new Date().toISOString(), firstName, kind: KIND };
        state.dayCounts[today]++;
        saveState(state);
        console.log(`[${i}/${remaining.length}] ✓ sent → ${email} (today: ${state.dayCounts[today]}/${PER_DAY})`);
      } catch (e) {
        console.log(`[${i}/${remaining.length}] ✗ failed → ${email}: ${e.message}`);
      }
    }

    // Randomized gap between sends
    if (state.dayCounts[today] < PER_DAY) {
      const gapMin = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);
      if (!DRY_RUN) {
        console.log(`     next in ${gapMin.toFixed(1)} min`);
        await new Promise((res) => setTimeout(res, gapMin * 60 * 1000));
      }
    }
  }

  console.log("\nAll done.");
  process.exit(0);
})();
