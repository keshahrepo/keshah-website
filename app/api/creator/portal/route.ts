import { NextRequest, NextResponse } from "next/server";
import { creatorToday, getHistory, getOnboarding, getPortalSettings, isOnboardingComplete, markContractStepDone } from "@/lib/creators/db";
import {
  ACCOUNTS_GUIDE_URL,
  ACCOUNTS_STEP_TEXT,
  FOUNDER_VIDEOS,
  KESHAH_SITE_URL,
  POSTING_GUIDE_URL,
  POSTING_RULES,
  WARMUP_DAYS,
  WARMUP_TEXT,
  publicQuiz,
} from "@/lib/creators/onboarding-content";
import { isWeekday, monthOf, VIDEOS_PER_WEEKDAY } from "@/lib/creators/pay";
import { msUntilLocalDeadline } from "@/lib/creators/time";
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
      contract: { status: creator.contract.status, signed_at: creator.contract.signed_at ?? null },
      tracking_url: creator.tracking_url || null,
      config: {
        slack_invite_url: settings.slack_invite_url,
        site_url: KESHAH_SITE_URL,
        founder_videos: FOUNDER_VIDEOS,
        quiz: publicQuiz(),
        accounts_step_text: ACCOUNTS_STEP_TEXT,
        accounts_guide_url: ACCOUNTS_GUIDE_URL || null,
        warmup_days: WARMUP_DAYS,
        warmup_text: WARMUP_TEXT,
        posting_guide_url: POSTING_GUIDE_URL || null,
        posting_rules: POSTING_RULES,
        videos_per_weekday: VIDEOS_PER_WEEKDAY,
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
