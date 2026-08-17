// Paced outreach sender for the 20 creator emails.
//
// Sends each creator's individually-composed pitch from contact@keshah.com
// via Google Workspace SMTP. Pacing is deliberately slow so the batch looks
// like manually-written outreach, not bulk mail.
//
// Setup (one-time):
//   1. Log into contact@keshah.com's Google Workspace account.
//   2. Enable 2-Step Verification → generate an App Password for "Mail".
//      https://myaccount.google.com/apppasswords
//   3. Copy the 16-character password.
//   4. Export env vars:
//        export KESHAH_GMAIL_USER="contact@keshah.com"
//        export KESHAH_GMAIL_APP_PASSWORD="xxxxxxxxxxxxxxxx"
//
// Run:
//   node scripts/_msg_creator_outreach.mjs --dry-run     # preview only
//   node scripts/_msg_creator_outreach.mjs               # send at default pace
//
// Optional flags:
//   --min-gap M       min minutes between sends (default 3)
//   --max-gap M       max minutes between sends (default 8)
//   --only NAME       send only the creator whose name matches (case-insensitive)
//   --dry-run         print, don't send
//
// State:
//   Tracks sent recipients in /tmp/_creator_outreach_sent.json. Safe to
//   kill and re-run — already-sent entries are auto-skipped.

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

const MIN_GAP = parseInt(args["min-gap"] || "3", 10);
const MAX_GAP = parseInt(args["max-gap"] || "8", 10);
const DRY_RUN = !!args["dry-run"];
const ONLY = args.only ? String(args.only).toLowerCase() : null;
const STATE_FILE = "/tmp/_creator_outreach_sent.json";

if (!DRY_RUN && (!process.env.KESHAH_GMAIL_USER || !process.env.KESHAH_GMAIL_APP_PASSWORD)) {
  console.error("Missing KESHAH_GMAIL_USER or KESHAH_GMAIL_APP_PASSWORD env vars.");
  console.error("Generate an App Password at: https://myaccount.google.com/apppasswords");
  process.exit(1);
}

// ── Recipients ──────────────────────────────────────────────────────────────
// Each entry is one email. `to` is the primary address; `cc` is optional.
// Body is pre-composed per creator so no interpolation is needed at send time.

const SIGNATURE = `Best,

Aadi
Founder, Keshah
www.keshah.com`;

const RECIPIENTS = [
  {
    name: "Josh",
    to: "joshuaugcmedia@gmail.com",
    subject: "Paid creator collaboration with Keshah",
    body: `Hi Josh,

I liked how naturally you presented your UGC platform comparison. The wooden spoon mic, clear structure, and conversational delivery made an informational topic feel like a genuine recommendation.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We're looking for creators who can turn our scalp tests, massage exercises, and app experience into engaging short-form videos.

This would be a paid presenter collaboration. You would not need to claim that you have experienced hair loss or suggest that Keshah produced personal results. We're interested in your ability to explain the concept naturally, perform the physical demonstrations, and test several opening hooks.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Aurianna",
    to: "ugcwithauri@gmail.com",
    subject: "Paid creator collaboration with Keshah",
    body: `Hi Aurianna,

Your confident tech content stood out to me. You use direct eye contact, physical props, and quick transitions while keeping your delivery natural rather than overly scripted.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We're looking for creators who can make short-form videos around an interactive scalp test, a physical massage demonstration, and the app experience.

This would be a paid presenter collaboration. You would not need to claim personal hair loss or say that you experienced results from Keshah. We would work with you on several hooks and demonstrations that fit your existing delivery style.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Kaytelynn",
    to: "kaytelynn@vampnetwork.com",
    cc: "Kaytelynn.ugc@gmail.com",
    subject: "Paid app creator collaboration with Keshah",
    body: `Hi Kaytelynn,

I liked how you made the app interface part of a relatable everyday scenario instead of presenting it like a conventional advertisement. That style is closely aligned with what we want for Keshah.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We're looking for a creator who can combine a simple physical scalp test with demonstrations and screen recordings of the guided routine inside the app.

This is a paid presenter collaboration. You would not need to claim personal hair loss or imply that you experienced results. We're interested in testing several opening hooks alongside one clear app demonstration.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Marlie",
    to: "mrwsdm14@gmail.com",
    subject: "Paid wellness creator collaboration with Keshah",
    body: `Hi Marlie,

I liked the natural energy of your creator journey update. Talking directly to viewers while using simple visual inserts made it feel like a genuine conversation instead of a scripted pitch.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We're looking for creators who can film an interactive scalp test, demonstrate a guided exercise, and briefly show how the app works.

This would be a paid presenter collaboration. You would not need to claim that you have hair loss or invent a personal transformation. We would work with you on several hooks and demonstrations that fit your conversational style.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Gianna",
    to: "ugcwithgiannaa@gmail.com",
    subject: "Paid creator collaboration with Keshah",
    body: `Hi Gianna,

Your candid, direct-to-camera delivery caught my attention because it feels like you're talking to one person rather than performing an advertisement. That is the type of natural presentation we want for Keshah.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We're looking for creators who can demonstrate a quick scalp test, explain one concept clearly, and introduce the guided app routine.

This would be a paid presenter collaboration. You would not need to claim personal hair loss, regrowth, or results from Keshah. We would focus on your delivery, the physical demonstration, and multiple opening hooks.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Curly Money UGC",
    to: "curlymoney55@gmail.com",
    subject: "Paid app creator collaboration with Keshah",
    body: `Hi,

I liked the relaxed, opinion-led delivery in your UGC app review. You kept direct eye contact and used a handheld prop naturally, which is close to the low-production presenter style we want for Keshah.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We're looking for creators who can turn our scalp tests, physical exercises, and app experience into engaging short-form videos.

This would be a paid presenter collaboration. You would not need to claim personal hair loss or results. We're interested in testing several hooks, demonstrations, and app-focused variations using your natural delivery style.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Elaine",
    to: "elainegong04@gmail.com",
    subject: "Paid wellness creator collaboration with Keshah",
    body: `Hi Elaine,

Your creator journey videos have a warm, controlled delivery and clear visual structure. I think that style could work especially well for calmly guiding viewers through a scalp test and massage routine.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We're looking for creators who can explain our concept naturally, demonstrate the exercises, and show how the guided app experience works.

This would be a paid presenter collaboration. You would not need to claim personal hair loss or results from using Keshah. We would focus on clear education, physical demonstrations, and several opening variations.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Matt",
    to: "foundedbymatt@gmail.com",
    subject: "Paid educational creator collaboration with Keshah",
    body: `Hi Matt,

I liked how you combined direct-to-camera explanation, visual panels, and an app walkthrough in your psychology content. That structured educational style maps closely to the content we want to create for Keshah.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We're looking for creators who can explain a physical wellness concept, demonstrate a scalp test, and integrate the app without making the video feel like a conventional advertisement.

This would be a paid presenter collaboration. You would not need to claim personal hair loss or say that Keshah produced personal results. We would focus on clear education, physical demonstrations, and several hook variations.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "JNO",
    to: "jno.ugc@gmail.com",
    subject: "Paid tech creator collaboration with Keshah",
    body: `Hi JNO,

I found your work while looking for male tech creators who can make an unfamiliar concept feel simple and credible. Your focus on tech, AI, and software content made you a strong fit for the test.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We're looking for a creator who can combine a physical scalp test with a concise explanation and app demonstration.

This would be a paid presenter collaboration. You would not need to claim that you personally experience hair loss or that Keshah produced results for you. We would focus on your ability to deliver the concept naturally and create several hook variations.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Sarah Banks",
    to: "Sarahbanksie.collab@gmail.com",
    subject: "Paid wellness creator collaboration with Keshah",
    body: `Hi Sarah,

I found your health and wellness creator work while looking for people who can explain a routine without making the content feel overly clinical. I think that presentation style could be a strong fit for Keshah.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We're looking for creators who can demonstrate a quick scalp test, introduce one guided exercise, and clearly show the app experience.

This would be a paid presenter collaboration. You would not need to claim personal hair loss or results from Keshah. We would focus on accessible education, physical demonstrations, and multiple opening hooks.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Richlen",
    to: "richlen@heyrichlen.com",
    subject: "Paid Keshah collaboration for your hair journey",
    body: `Hi Richlen,

I've been watching your hair transplant recovery updates. The self-deprecating humor, honest close-ups, and fast progression make the journey entertaining without hiding what recovery actually looks like.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We'd like to explore a paid collaboration where you test the app as an additional scalp care routine and document only what you genuinely experience.

We would not ask you to credit Keshah for your transplant results or make guaranteed hair growth claims. The content could focus on your starting scalp mobility, learning the routine, consistency, and how your scalp feels over time, subject to anything your clinician recommends.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Iviwe",
    to: "iviweyengwa@gmail.com",
    subject: "Paid Keshah collaboration for your postpartum hair journey",
    body: `Hi Iviwe,

Your postpartum hairline video stood out because you showed both the earlier photo and your current hairline while explaining the emotional side of the experience in a warm and patient way.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We'd like to explore a paid and transparent content series where you try the guided routine alongside your existing hair care and document your genuine experience.

We would not ask you to replace your current products, imply that Keshah caused regrowth, or promise results. The content could focus on a starting scalp test, learning the massage routine, consistency, and honest checkpoints.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Alena",
    to: "alena@starlinemgmt.com",
    subject: "Paid Keshah collaboration with Alena",
    body: `Hi Starline team,

I'm reaching out regarding a paid collaboration with Alena. Her "Can you spot my new bald spot?" video handled a vulnerable alopecia update with humor, clear visual proof, and fast storytelling. That honest but entertaining voice is exactly what we value.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We'd like to discuss an authentic test or short series in which Alena explores the guided routine and reports only what she genuinely observes.

We would not ask her to present Keshah as an alopecia treatment, guarantee regrowth, or suggest it replaces medical care. The content could focus on scalp mobility, learning the routine, consistency, and her honest experience using the app.

If this sounds relevant, the next step is a short call to discuss the creative direction, deliverables, and compensation. A suitable time can be selected here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, please reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Steph",
    to: "life.with.steph2@gmail.com",
    subject: "Paid Keshah collaboration for your hair journey",
    body: `Hi Steph,

Your documentary about going bald in your twenties communicated the emotional reality of hair loss without forcing a sales message or pretending the experience was easy.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We'd like to explore a paid collaboration where you test the guided routine alongside your existing approach and document the experience honestly.

We would not ask you to make regrowth promises or attribute changes to Keshah when other routines may also be involved. The content could focus on your starting scalp mobility, consistency, the app experience, and genuine checkpoints.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Leonie",
    to: "leoniewiththecurls@gmail.com",
    subject: "Paid Keshah scalp routine collaboration",
    body: `Hi Leonie,

Your page already focuses on fine, low-density hair, scalp health, and a documented routine that includes scalp massage. That makes you particularly relevant for testing whether a guided app can help structure the routine and make the technique easier to follow.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We'd like to explore a paid collaboration where you test the app alongside your existing routine and document only what you genuinely experience.

We would not ask you to guarantee regrowth, replace your current approach, or attribute unrelated changes to Keshah. The content could focus on your starting scalp mobility, the guided exercises, consistency, and honest follow-ups.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Wayde",
    to: "waydecado@gmail.com",
    subject: "Paid Keshah collaboration for your hair journey",
    body: `Hi Wayde,

I found your page while looking for creators openly navigating hair loss in their twenties while also making broader wellness content. That combination makes your content especially relevant to Keshah's guided scalp routine.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We'd like to explore a paid collaboration where you test the routine and document your genuine experience over time.

We would not ask you to guarantee regrowth, replace anything you currently use, or suggest Keshah caused changes that could have other explanations. The content could focus on your baseline scalp mobility, learning the exercises, consistency, and honest follow-ups.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "PJ",
    to: "peachypippaj@gmail.com",
    subject: "Paid Keshah scalp routine collaboration",
    body: `Hi PJ,

Your page openly shares your hair loss and regrowth journey rather than hiding the difficult parts. That transparency is exactly what we want in a creator testing Keshah.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We'd like to explore a paid collaboration where you add the guided routine to your existing approach and document your genuine experience.

We would not ask you to promise regrowth, stop your current routine, or overstate what caused any future changes. The content could focus on your starting scalp mobility, using the exercises consistently, the app experience, and honest checkpoints.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Renee",
    to: "reneebrigitte2@gmail.com",
    subject: "Paid Keshah collaboration for your hair journey",
    body: `Hi Renee,

Your content openly documents how unpredictable hair loss and regrowth can be. That level of transparency is exactly what we want for a paid test of Keshah's guided scalp routine.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We'd like to explore a collaboration where you test the app alongside your existing routine and share only what you genuinely observe.

We would not ask you to guarantee regrowth, replace your current approach, or credit Keshah for changes that could have other causes. The content could focus on your starting scalp mobility, the guided exercises, consistency, and honest follow-ups.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Rumneek",
    to: "rumneek.bans@yahoo.com",
    subject: "Paid Keshah scalp massage collaboration",
    body: `Hi Rumneek,

I found your hair loss tips within your broader fashion, beauty, and girl talk content. Your accessible presentation style could make a structured scalp routine easy for viewers to understand and follow.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We'd like to explore a paid collaboration where you try the guided routine and document your genuine experience.

We would not ask you to guarantee regrowth, replace your current routine, or credit Keshah for changes that could have other explanations. The content could focus on a scalp mobility test, learning the exercises, consistency, and honest checkpoints.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
  {
    name: "Maddi",
    to: "padditodd@gmail.com",
    subject: "Paid Keshah collaboration for your hair growth content",
    body: `Hi Maddi,

I came across your return to hair growth content. Your page has a strong personality beyond the hair niche, which could help the Keshah routine feel like part of real life instead of a conventional hair advertisement.

I'm Aadi, founder of Keshah, a guided scalp massage and scalp mobility app. We'd like to explore a paid collaboration where you test the routine and document your genuine experience.

We would not ask you to promise regrowth, replace your existing approach, or credit Keshah for changes that may have other causes. The content could focus on your starting scalp mobility, learning the exercises, consistency, and honest follow-ups.

If this sounds like a fit, the next step is a short call to discuss the creative direction, deliverables, and compensation. You can choose a time here:

https://calendly.com/aadi-keshah/content-creator-interview

If none of the available times work, reply with your availability and we can arrange another time.

${SIGNATURE}`,
  },
];

// ── State ──────────────────────────────────────────────────────────────────
function loadState() {
  if (!existsSync(STATE_FILE)) return { sent: {} };
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return { sent: {} }; }
}
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  const state = loadState();
  const filtered = ONLY
    ? RECIPIENTS.filter((r) => r.name.toLowerCase().includes(ONLY))
    : RECIPIENTS;
  const remaining = filtered.filter((r) => !state.sent[r.to]);
  console.log(`Total: ${filtered.length}, already sent: ${filtered.length - remaining.length}, remaining: ${remaining.length}`);

  if (remaining.length === 0) { console.log("Nothing to do."); process.exit(0); }

  let transporter = null;
  if (!DRY_RUN) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.KESHAH_GMAIL_USER,
        pass: process.env.KESHAH_GMAIL_APP_PASSWORD,
      },
    });
    try { await transporter.verify(); console.log(`✓ SMTP auth verified for ${process.env.KESHAH_GMAIL_USER}\n`); }
    catch (e) { console.error("SMTP auth failed:", e.message); process.exit(1); }
  } else {
    console.log("(DRY RUN — nothing will actually send)\n");
  }

  let i = 0;
  for (const r of remaining) {
    i++;
    if (DRY_RUN) {
      console.log(`[${i}/${remaining.length}] → ${r.to}${r.cc ? ` (cc: ${r.cc})` : ""}`);
      console.log(`     name:    ${r.name}`);
      console.log(`     subject: ${r.subject}`);
      console.log(`     first 80 chars of body: ${r.body.slice(0, 80).replace(/\n/g, " ⏎ ")}\n`);
    } else {
      try {
        await transporter.sendMail({
          from: `Aadi from Keshah <${process.env.KESHAH_GMAIL_USER}>`,
          to: r.to,
          cc: r.cc,
          subject: r.subject,
          text: r.body,
        });
        state.sent[r.to] = { sentAt: new Date().toISOString(), name: r.name };
        saveState(state);
        console.log(`[${i}/${remaining.length}] ✓ sent → ${r.to} (${r.name})`);
      } catch (e) {
        console.log(`[${i}/${remaining.length}] ✗ failed → ${r.to}: ${e.message}`);
      }
    }

    if (i < remaining.length) {
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
