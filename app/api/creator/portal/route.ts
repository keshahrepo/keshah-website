import { NextRequest, NextResponse } from "next/server";
import { creatorToday, getHistory, getOnboarding, getPortalSettings, isOnboardingComplete, markContractStepDone } from "@/lib/creators/db";
import {
  ACCOUNTS_GUIDE_URL,
  ACCOUNTS_STEP_TEXT,
  FOUNDER_VIDEOS,
  KESHAH_SITE_URL,
  POSTING_GUIDE_URL,
  POSTING_RULES,
  FIRST_POSTING_DAY_TEXT,
  HANDLE_TAKEN_TEXT,
  VERIFICATION_CODE_TEXT,
  WARMUP_DAYS,
  WARMUP_DONE_TEXT,
  WARMUP_HEADLINE,
  WARMUP_TEXT,
  publicQuiz,
  suggestedHandle,
} from "@/lib/creators/onboarding-content";
import { isWeekday, monthOf, videosRequiredOn } from "@/lib/creators/pay";
import { msUntilLocalDeadline } from "@/lib/creators/time";
import { creatorDeadline } from "@/lib/creators/deadline";
import { errorResponse, publicCreator, requireCreator } from "../_auth";
import { monthPayload } from "../_payload";

export const dynamic = "force-dynamic";

// GET: everything the portal needs on load.
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const now = new Date();
    const today = creatorToday(creator, now);
    const [onb, history, settings] = await Promise.all([getOnboarding(creator.id), getHistory(creator.id), getPortalSettings()]);
    // Self-heal: a contract marked signed by admin (or a sign whose step write failed) ticks the contract step.
    const onboarding =
      creator.contract.status === "signed" && !onb.contract_signed_at
        ? await markContractStepDone(creator.id, creator.contract.signed_at || now.toISOString())
        : onb;
    const todayLog = history.postingDays.find((p) => p.date === today) ?? null;
    return NextResponse.json({
      creator: publicCreator(creator),
      onboarding: { ...onboarding, complete: isOnboardingComplete(onboarding, { contractSigned: creator.contract.status === "signed" }) },
      // deadline_at / deadline_date (ET): the 72-hour signing deadline, while it's unsigned (null otherwise).
      contract: { status: creator.contract.status, signed_at: creator.contract.signed_at ?? null, ...(creatorDeadline(creator) ?? { deadline_at: null, deadline_date: null }) },
      tracking_url: creator.tracking_url || null,
      config: {
        slack_invite_url: settings.slack_invite_url,
        site_url: KESHAH_SITE_URL,
        founder_videos: FOUNDER_VIDEOS,
        quiz: publicQuiz(),
        accounts_step_text: ACCOUNTS_STEP_TEXT,
        verification_code_text: VERIFICATION_CODE_TEXT,
        suggested_handle: suggestedHandle(creator.name),
        handle_taken_text: HANDLE_TAKEN_TEXT,
        accounts_guide_url: ACCOUNTS_GUIDE_URL || null,
        warmup_days: WARMUP_DAYS,
        warmup_headline: WARMUP_HEADLINE,
        warmup_text: WARMUP_TEXT,
        warmup_done_text: WARMUP_DONE_TEXT,
        first_posting_day_text: FIRST_POSTING_DAY_TEXT,
        posting_guide_url: POSTING_GUIDE_URL || null,
        posting_rules: POSTING_RULES,
        // 3 during a v2 trial, 5 after (and always 5 on the original plan).
        videos_per_weekday: videosRequiredOn(creator.start_date ? creator : { ...creator, start_date: today }, history.postingDays, today),
      },
      today: {
        date: today,
        is_weekday: isWeekday(today),
        ms_until_deadline: msUntilLocalDeadline(now, creator.timezone),
        log: todayLog,
      },
      month: await monthPayload(creator, monthOf(today), history, now),
    });
  } catch (e) {
    return errorResponse(e, "portal");
  }
}
