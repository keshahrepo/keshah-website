// POST /api/quiz/log
//
// Client-side quiz-step submissions POST here so we capture ALL answers
// (paid or not), not just the ones that get carried through Stripe
// metadata to the Users doc. The onboarding-web dashboard reads from
// QuizAnswers to show real drop-off answer distributions.
//
// Body: { sessionId, source, answers: { [camelKey]: value } }
// Writes one doc per (sessionId, field) — deterministic doc id so the
// same field being re-answered overwrites rather than duplicating.
//
// Fire-and-forget from the client. Non-throwing — quiz UX must not
// block on Firestore latency.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

// Bot filter — same list of UA tokens as /api/funnel/track so we don't
// pollute the collection with crawler traffic.
const BOT_TOKENS = [
  "bot",
  "crawl",
  "spider",
  "facebookexternalhit",
  "meta-externalagent",
  "slackbot",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "telegram",
  "discordbot",
  "googlebot",
  "bingbot",
  "duckduckbot",
  "yandex",
  "baiduspider",
  "applebot",
  "petalbot",
];
function isBot(ua: string | null | undefined): boolean {
  if (!ua) return true;
  const lower = ua.toLowerCase();
  return BOT_TOKENS.some((t) => lower.includes(t));
}

// hairGoal → hair_goal / firstName → first_name / ageRange → age_range.
// Standard JS camelCase → snake_case conversion. Keeps parity with the
// snake_case keys the dashboard's QUESTIONS list already expects.
function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, "_$1").toLowerCase();
}

interface Body {
  sessionId?: string;
  source?: string;
  answers?: Record<string, unknown>;
}

export async function POST(req: Request) {
  if (isBot(req.headers.get("user-agent"))) {
    return NextResponse.json({ ok: true, skipped: "bot" });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "bad_json" },
      { status: 400 },
    );
  }

  const { sessionId, source, answers } = body;
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json(
      { ok: false, error: "missing_session_id" },
      { status: 400 },
    );
  }
  if (!answers || typeof answers !== "object") {
    return NextResponse.json(
      { ok: false, error: "missing_answers" },
      { status: 400 },
    );
  }

  const { db } = getFirebaseAdmin();
  const dateStr = new Date().toISOString().slice(0, 10);
  const src = typeof source === "string" && source ? source : "us";

  const writes: Promise<unknown>[] = [];
  for (const [rawField, value] of Object.entries(answers)) {
    if (value === null || value === undefined || value === "") continue;
    const field = camelToSnake(rawField);
    // Deterministic doc id — re-answering the same field overwrites
    // instead of duplicating. Sanitize field to be doc-id-safe.
    const safeField = field.replace(/[^a-z0-9_]/gi, "_");
    const docId = `${sessionId}_${safeField}`;
    writes.push(
      db.collection("QuizAnswers").doc(docId).set(
        {
          sessionId,
          field,
          value,
          source: src,
          date: dateStr,
          timestamp: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    );
  }

  try {
    await Promise.all(writes);
    return NextResponse.json({ ok: true, count: writes.length });
  } catch (err) {
    console.error("[quiz/log] write failed:", err);
    return NextResponse.json(
      { ok: false, error: "write_failed" },
      { status: 200 },
    );
  }
}
