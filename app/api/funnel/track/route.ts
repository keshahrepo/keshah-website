// Tracks step views in the web funnel for analytics.
// Each request logs a step view with a session ID so we can count both
// total views and unique sessions per step.
//
// Writes to Firestore collection `FunnelEvents/{sessionId}_{step}`.
// Using a deterministic doc ID dedupes re-entries (e.g. back-nav within a
// multi-step screen like PinchTest) so a session is counted at most once
// per step. The dashboard reads from this collection to build the funnel.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface TrackPayload {
  step: string;
  sessionId: string;
  source?: "us" | "india" | "india2" | "india3" | "us_trial" | "india_premium_trial";
}

// User-Agent patterns that identify non-human traffic: social-media link
// unfurlers (Meta/Slack/Twitter/etc. hit the page when an ad URL is posted
// or previewed), search-engine crawlers, headless automation, and raw
// HTTP clients. These inflate the Hook step specifically because they
// land on /start but never interact. Rejecting them here keeps the funnel
// denominator honest. Fail-open on ambiguous UAs so we don't lose real
// users to false positives.
const BOT_UA_RE =
  /bot\b|crawler|spider|scraper|facebookexternalhit|meta-external|slackbot|twitterbot|linkedinbot|pinterestbot|discordbot|whatsapp|telegram|googlebot|bingbot|yandex|duckduckbot|applebot|ahrefs|semrush|mj12|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|\bcurl\b|\bwget\b|python-requests|axios|node-fetch/i;

function isBot(req: Request): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua) return true; // Real browsers always send a UA.
  return BOT_UA_RE.test(ua);
}

export async function POST(req: Request) {
  // Silently drop bot traffic — return ok:true so we don't give the
  // bot a signal we're filtering it, but skip the Firestore write.
  if (isBot(req)) {
    return NextResponse.json({ ok: true, filtered: "bot" });
  }

  let payload: TrackPayload;
  try {
    payload = (await req.json()) as TrackPayload;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!payload.step || !payload.sessionId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const { db } = getFirebaseAdmin();
    // Deterministic doc ID — if the session already hit this step, the
    // create() call throws and we treat it as a no-op.
    const docId = `${payload.sessionId}_${payload.step}`.replace(/[/]/g, "_");
    const ref = db.collection("FunnelEvents").doc(docId);
    try {
      await ref.create({
        step: payload.step,
        sessionId: payload.sessionId,
        source: payload.source ?? "us",
        timestamp: FieldValue.serverTimestamp(),
        date: new Date().toISOString().split("T")[0],
      });
    } catch {
      // Already exists — session already recorded for this step.
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Fail silently — don't break the funnel
  }
}
