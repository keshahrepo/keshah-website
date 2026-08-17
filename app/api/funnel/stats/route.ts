// Aggregates funnel step data for the dashboard.
// Returns total views and unique sessions per step, ordered by funnel position.
// Supports date range filtering via ?days=7 (default 7).

import { NextResponse, type NextRequest } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

// Men's / generic-US funnel (us_weekly_trial, us_kit, us_trial). Excludes
// women-only quiz steps (qualificationResponse, hairLossTiming/Rate/
// RateResponse, hairSymptoms, triggerContext, stressFrequencyResponse,
// recentStressEvent) and the dead whyItHappens step. Includes
// founderStory + quizIntro which fire on the generic /startus3 path
// (DEFAULT_CONFIG.skipFounderStory === false).
const MEN_STEP_ORDER = [
  "hook",
  "pinchTest",
  "founderStory",
  "quizIntro",
  "quizGender",
  "qualification",
  "hairLossLocation",
  "hairLossLocationResponse",
  "hairLossSeverity",
  "familyHistory",
  "stressFrequency",
  "hairGoal",
  "commitment",
  "diagnosisLoading",
  "personalizedDiagnosis",
  "techniquesPreview",
  "dailyRoutinePreview",
  "videoSessionPreview",
  "learningsPreview",
  "guidesPreview",
  "resultScreenshots",
  "socialProof",
  "trialPaywall",
  "signUp",
  "purchaseSuccess",
];

// Women's funnels (us_women_mandy, us_women_jennifer, us_women_donna).
// founderStory + quizIntro auto-skip on women's funnels. qualificationResponse
// + hairLossTiming + hairLossRate + hairLossRateResponse + hairSymptoms +
// triggerContext + stressFrequencyResponse + recentStressEvent are
// women-only. HairLossSeverity / FamilyHistory / StressFrequency render
// for both genders (top-of-file comments are stale; code-level gating
// allows them through for women).
const WOMEN_STEP_ORDER = [
  "hook",
  "pinchTest",
  "quizGender",
  "qualification",
  "qualificationResponse",
  "hairLossLocation",
  "hairLossLocationResponse",
  "hairLossSeverity",
  "hairLossTiming",
  "hairLossRate",
  "hairLossRateResponse",
  "hairSymptoms",
  "triggerContext",
  "familyHistory",
  "stressFrequency",
  "stressFrequencyResponse",
  "recentStressEvent",
  "hairGoal",
  "commitment",
  "diagnosisLoading",
  "personalizedDiagnosis",
  "techniquesPreview",
  "dailyRoutinePreview",
  "videoSessionPreview",
  "learningsPreview",
  "guidesPreview",
  "resultScreenshots",
  "socialProof",
  "trialPaywall",
  "signUp",
  "purchaseSuccess",
];

// Pick the right funnel sequence based on source attribution. Anything
// starting with "us_women_" is a women's-funnel source (mandy, jennifer,
// donna). Default to men's order for everything else.
function getStepOrder(source: string): string[] {
  if (source.startsWith("us_women_")) return WOMEN_STEP_ORDER;
  return MEN_STEP_ORDER;
}

// Sub-steps that expand inside their parent step. PinchTest sub-step
// order is sides-then-top (swapped earlier so users hit a baseline first).
// Founder story has 25 beats in founder-story-data.tsx.
const SUB_STEPS: Record<string, { keys: string[]; labels: Record<string, string> }> = {
  pinchTest: {
    keys: ["pinchTest.pinchSides", "pinchTest.pinchTop", "pinchTest.result"],
    labels: {
      "pinchTest.pinchSides": "↳ Pinch sides",
      "pinchTest.pinchTop": "↳ Pinch top of head",
      "pinchTest.result": "↳ Result screen",
    },
  },
  founderStory: {
    keys: Array.from({ length: 25 }, (_, i) => `founderStory.beat_${i + 1}`),
    labels: Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [`founderStory.beat_${i + 1}`, `↳ Beat ${i + 1}`])
    ),
  },
};

// Human-readable labels for dashboard. Covers both men's and women's
// funnel steps so the same label map works for either source.
const STEP_LABELS: Record<string, string> = {
  hook: "Hook",
  pinchTest: "Pinch Test",
  founderStory: "Founder Story",
  quizIntro: "Quiz Intro",
  quizGender: "Gender",
  qualification: "Qualification",
  qualificationResponse: "Qualification Response",
  hairLossLocation: "Hair Loss Location",
  hairLossLocationResponse: "Location Response",
  hairLossSeverity: "Severity",
  hairLossTiming: "Loss Timing",
  hairLossRate: "Loss Rate",
  hairLossRateResponse: "Rate Response",
  hairSymptoms: "Symptoms",
  triggerContext: "Triggers",
  familyHistory: "Family History",
  stressFrequency: "Stress Frequency",
  stressFrequencyResponse: "Stress Response",
  recentStressEvent: "Recent Stress",
  hairGoal: "Hair Goal",
  commitment: "Commitment",
  diagnosisLoading: "Diagnosis Loading",
  personalizedDiagnosis: "Personalized Diagnosis",
  techniquesPreview: "Techniques Preview",
  dailyRoutinePreview: "Daily Routine Preview",
  videoSessionPreview: "Video Session Preview",
  learningsPreview: "Learnings Preview",
  guidesPreview: "Guides Preview",
  resultScreenshots: "Result Screenshots",
  socialProof: "Social Proof",
  trialPaywall: "Paywall",
  signUp: "Sign Up",
  purchaseSuccess: "Purchase Success",
};

// Hard floor for funnel data — events with a timestamp before this instant
// are excluded from aggregates regardless of the requested `days` window.
// Reset to 2026-05-13T20:36Z — start of fresh TikTok-only ad spend on
// /startus3 with the new server-side InitiateCheckout + ttclid persistence
// fixes deployed. Earlier Meta-era data + test-purchase noise is excluded
// so the dashboard shows clean apples-to-apples TikTok funnel metrics.
// Pre-launch traffic stays in Firestore untouched for historical reference.
// Bump again whenever the funnel shape changes materially or you start a
// new clean ad-spend phase.
const FUNNEL_RESET_AT = new Date("2026-05-13T20:36:00.000Z");

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "7", 10);
  const sourceFilter = req.nextUrl.searchParams.get("source") ?? "us";
  const rollingCutoff = new Date();
  rollingCutoff.setDate(rollingCutoff.getDate() - days);
  // Whichever is later wins — rolling window can shrink the range but
  // never expand it past the reset instant.
  const cutoffInstant =
    rollingCutoff > FUNNEL_RESET_AT ? rollingCutoff : FUNNEL_RESET_AT;
  // Keep a date-string approximation for the Firestore `date` index so we
  // can use a server-side range query; the exact timestamp filter runs
  // client-side below. Subtract one day to avoid excluding boundary
  // events whose `date` field was set before the precise instant.
  const dateFloor = new Date(cutoffInstant);
  dateFloor.setDate(dateFloor.getDate() - 1);
  const cutoffDate = dateFloor.toISOString().split("T")[0];

  try {
    const { db } = getFirebaseAdmin();

    const snapshot = await db
      .collection("FunnelEvents")
      .where("date", ">=", cutoffDate)
      .get();

    // Aggregate: count total views and unique sessions per step
    const stepViews: Record<string, number> = {};
    const stepSessions: Record<string, Set<string>> = {};

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const step = data.step as string;
      const sessionId = data.sessionId as string;
      // Enforce the precise reset instant — Firestore `date` index is
      // day-granular, so events from earlier in the reset day that pre-date
      // the hook launch slip through the server-side filter.
      const ts = data.timestamp?.toDate?.() ?? null;
      if (ts && ts < cutoffInstant) continue;
      const eventSource = (data.source as string) ?? "us";
      if (eventSource !== sourceFilter) continue;

      if (!stepViews[step]) {
        stepViews[step] = 0;
        stepSessions[step] = new Set();
      }
      stepViews[step]++;
      stepSessions[step].add(sessionId);
    }

    // Build ordered funnel data, inserting sub-steps after their parent
    const funnel: Array<{
      step: string;
      label: string;
      users: number;
      views: number;
      dropoff: number;
      retention: number;
      isSubStep?: boolean;
    }> = [];

    const stepOrder = getStepOrder(sourceFilter);
    let prevUsers = 0;
    stepOrder.forEach((step, i) => {
      const users = stepSessions[step]?.size ?? 0;
      const views = stepViews[step] ?? 0;
      const ref = i === 0 ? users : prevUsers;
      const dropoff = ref > 0 ? Math.round(((ref - users) / ref) * 100) : 0;

      funnel.push({
        step,
        label: STEP_LABELS[step] ?? step,
        users,
        views,
        dropoff: i === 0 ? 0 : dropoff,
        retention: ref > 0 ? Math.round((users / ref) * 100) : 0,
      });

      // Insert sub-steps if they exist for this step
      if (SUB_STEPS[step]) {
        let subPrev = users; // start from parent step users
        for (const subKey of SUB_STEPS[step].keys) {
          const subUsers = stepSessions[subKey]?.size ?? 0;
          const subViews = stepViews[subKey] ?? 0;
          const subDrop = subPrev > 0 ? Math.round(((subPrev - subUsers) / subPrev) * 100) : 0;
          funnel.push({
            step: subKey,
            label: SUB_STEPS[step].labels[subKey] ?? subKey,
            users: subUsers,
            views: subViews,
            dropoff: subDrop,
            retention: subPrev > 0 ? Math.round((subUsers / subPrev) * 100) : 0,
            isSubStep: true,
          });
          if (subUsers > 0) subPrev = subUsers;
        }
      }

      prevUsers = users;
    });

    const totalSessions = new Set(snapshot.docs.map((d) => d.data().sessionId)).size;

    return NextResponse.json({
      ok: true,
      days,
      totalSessions,
      totalEvents: snapshot.size,
      funnel,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[funnel/stats] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
