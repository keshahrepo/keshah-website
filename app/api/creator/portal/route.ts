import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { DAY1_PINNED_POSTS, countPinnedDay1, day1PinnedFor, onPinnedDay1, pinnedLiveFor, pinnedOf } from "@/lib/creators/pinned-video";
import {
  CREATORS_COLLECTION,
  assignedHandleFor,
  creatorToday,
  getHistory,
  getMonthOverview,
  getOnboarding,
  getPortalSettings,
  hasStarted,
  isOnboardingComplete,
  markContractStepDone,
  type CreatorHistory,
  onboardingSteps,
} from "@/lib/creators/db";
import { setupInputFromDoc, setupState } from "@/lib/creators/setup-deadline";
import { finalPayFor, firstPostingDay } from "@/lib/creators/lifecycle";
import { LINK_WAIT_TEXT, agreementEndedText } from "@/lib/creators/notices";
import type { CreatorProfile } from "@/lib/creators/types";
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
} from "@/lib/creators/onboarding-content";
import { isWeekday, monthOf, planBaseCents, planVideos, trialDayCents, videosRequiredOn } from "@/lib/creators/pay";
import { msUntilLocalDeadline } from "@/lib/creators/time";
import { creatorDeadline } from "@/lib/creators/deadline";
import { creatorKickoffUrl } from "@/lib/creators/invite";
import { errorResponse, publicCreator, requireCreator } from "../_auth";
import { monthPayload } from "../_payload";

export const dynamic = "force-dynamic";

/** { url (Calendly, their name and email filled in), start_time when booked }; null without a booking link. */
function kickoffCallOf(d: Record<string, unknown>): { url: string; start_time: string | null } | null {
  const base = creatorKickoffUrl();
  if (!base) return null;
  const q = new URLSearchParams();
  if (d.name) q.set("name", String(d.name));
  if (d.email) q.set("email", String(d.email));
  const call = (d.kickoff_call ?? {}) as Record<string, unknown>;
  return { url: q.size ? `${base}${base.includes("?") ? "&" : "?"}${q}` : base, start_time: typeof call.start_time === "string" ? call.start_time : null };
}

// GET: everything the portal needs on load.
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const now = new Date();
    const today = creatorToday(creator, now);
    const [onb, history, settings, raw] = await Promise.all([
      getOnboarding(creator.id),
      getHistory(creator.id),
      getPortalSettings(),
      getFirebaseAdmin().db.collection(CREATORS_COLLECTION).doc(creator.id).get(),
    ]);
    let pinned = pinnedOf(raw.data());
    // Day 1: both pinned posts up and pinned on both apps (seen by the post sync) counts it.
    if (onb.completed_at && onPinnedDay1(hasStarted(creator), pinned)) {
      const c = await day1PinnedFor(creator.id, today).catch(() => null);
      if (c && c.tiktok >= DAY1_PINNED_POSTS && c.instagram >= DAY1_PINNED_POSTS && (await countPinnedDay1(creator.id, today, now).catch(() => false))) {
        pinned = { ...(pinned ?? { path: "", submitted_at: "" }), status: "approved", no_upload: true, counted_day: today };
      }
    }
    const pinnedLive = await pinnedLiveFor(creator.id, pinned);
    // Self-heal: a contract marked signed by admin (or a sign whose step write failed) ticks the contract step.
    const onboarding =
      creator.contract.status === "signed" && !onb.contract_signed_at
        ? await markContractStepDone(creator.id, creator.contract.signed_at || now.toISOString())
        : onb;
    const todayLog = history.postingDays.find((p) => p.date === today) ?? null;
    const complete = isOnboardingComplete(onboarding, { contractSigned: creator.contract.status === "signed" });
    const started = hasStarted(creator);
    // Warm-up done but their link isn't in yet: posting waits for it (LINK_WAIT_TEXT).
    const warmupDone = (onboarding.warmup_days ?? []).length >= WARMUP_DAYS;
    const waitingForLink = !started && warmupDone && !onboarding.link_seen_at && !creator.tracking_url;
    // The next weekday after Getting started is finished; null until then or once started.
    const firstDay = !started && onboarding.completed_at ? firstPostingDay(onboarding.completed_at, creator.timezone) : null;
    // The 3-day setup deadline (lib/creators/setup-deadline.ts): drives the Getting started timeline.
    const setup = started ? null : setupState(setupInputFromDoc(raw.data() ?? {}, onboarding, onboardingSteps(onboarding, { contractSigned: creator.contract.status === "signed" })), now);
    return NextResponse.json({
      creator: publicCreator(creator),
      // onboarding / trial / active / leaving / ended. Ended: the app shows the agreement card, no posting prompts.
      status: creator.status,
      // Only for someone who had an agreement (signed); a withdrawn offer never did.
      agreement: creator.status === "ended" && creator.ended_on && creator.contract.status === "signed" ? await agreementSummary(creator, history, now) : null,
      onboarding: {
        ...onboarding,
        complete,
        waiting_for_link: waitingForLink,
        link_wait_text: waitingForLink ? LINK_WAIT_TEXT : null,
        first_posting_day: firstDay,
        // { done, steps_left, next_step, due_date (yyyy-mm-dd, their tz), waiting_on_us, overdue_days }; null once started.
        setup,
      },
      // deadline_at / deadline_date (ET): the 72-hour signing deadline, while it's unsigned (null otherwise).
      contract: { status: creator.contract.status, signed_at: creator.contract.signed_at ?? null, ...(creatorDeadline(creator) ?? { deadline_at: null, deadline_date: null }) },
      tracking_url: creator.tracking_url || null,
      // The call with Aadi, booked from the app right after signing (until they start posting).
      kickoff_call: started ? null : kickoffCallOf(raw.data() ?? {}),
      // The first-posting-day pinned video: status, the founder's note, and whether a post is pinned yet.
      pinned_video: pinned ? { status: pinned.status, note: pinned.note ?? null, counted_day: pinned.counted_day ?? null, requested_day: pinned.requested_day ?? null, ...(pinned.skipped ? { skipped: true } : {}), ...(pinned.no_upload ? { no_upload: true } : {}) } : null,
      pinned_live: pinnedLive,
      config: {
        slack_invite_url: settings.slack_invite_url,
        pinned_reference_url: settings.pinned_reference_url,
        pinned_howto_url: settings.pinned_howto_url,
        site_url: KESHAH_SITE_URL,
        founder_videos: FOUNDER_VIDEOS,
        quiz: publicQuiz(),
        accounts_step_text: ACCOUNTS_STEP_TEXT,
        verification_code_text: VERIFICATION_CODE_TEXT,
        suggested_handle: await assignedHandleFor(creator.id, creator.name),
        handle_taken_text: HANDLE_TAKEN_TEXT,
        accounts_guide_url: ACCOUNTS_GUIDE_URL || null,
        warmup_days: WARMUP_DAYS,
        warmup_headline: WARMUP_HEADLINE,
        warmup_text: WARMUP_TEXT,
        warmup_done_text: WARMUP_DONE_TEXT,
        first_posting_day_text: FIRST_POSTING_DAY_TEXT,
        link_wait_text: LINK_WAIT_TEXT,
        posting_guide_url: POSTING_GUIDE_URL || null,
        posting_rules: POSTING_RULES,
        // 3 during a v2 trial, 5 after (and always 5 on the original plan).
        videos_per_weekday: videosRequiredOn(creator.start_date ? creator : { ...creator, start_date: today }, history.postingDays, today),
        // Their monthly plan after the trial (null on the original ladder), and their trial day pay.
        plan: planBaseCents(creator) !== null ? { name: creator.pay_plan, base_cents: planBaseCents(creator), videos_per_weekday: planVideos(creator) } : null,
        trial_day_cents: trialDayCents(creator),
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

/**
 * The ended card: "Your agreement ended on Oct 14. Final pay $300 arrives by
 * Nov 8." Final pay = unpaid invoices through the last invoice month, plus the
 * end month while it has no invoice yet.
 */
async function agreementSummary(creator: CreatorProfile, history: CreatorHistory, now: Date) {
  const endedOn = creator.ended_on!;
  const endMonth = monthOf(endedOn);
  const open = history.invoices.some((i) => i.month === endMonth && i.status !== "draft")
    ? 0
    : (await getMonthOverview(creator, endMonth, { now, history }).catch(() => null))?.lines.reduce((a, l) => a + l.amount_cents, 0) ?? 0;
  const pay = finalPayFor(endedOn, history.invoices, open);
  return {
    ended_on: endedOn,
    final_pay_cents: pay.cents,
    final_pay_by: pay.payBy,
    text: agreementEndedText(endedOn, pay.cents, pay.payBy),
  };
}
