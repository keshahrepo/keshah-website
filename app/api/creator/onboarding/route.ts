import { NextRequest, NextResponse } from "next/server";
import { isOnboardingComplete, setOnboardingStep } from "@/lib/creators/db";
import type { OnboardingStep } from "@/lib/creators/types";
import { errorResponse, requireCreator } from "../_auth";

// POST { step, tiktok_handle?, instagram_handle?, video_id?, answers?, report? }
// accounts + report: true answers { accounts: { ok, tiktok, instagram } } instead of an error (the app's check screen).
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const body = await req.json();
    const { state, quiz, accounts } = await setOnboardingStep(creator.id, body.step as OnboardingStep, {
      tiktok_handle: body.tiktok_handle,
      instagram_handle: body.instagram_handle,
      video_id: body.video_id,
      answers: Array.isArray(body.answers) ? body.answers.map(Number) : undefined,
      report: body.report === true,
    });
    const complete = isOnboardingComplete(state, { contractSigned: creator.contract.status === "signed" });
    return NextResponse.json({ onboarding: { ...state, complete }, quiz: quiz ?? null, accounts: accounts ?? null });
  } catch (e) {
    return errorResponse(e, "onboarding");
  }
}
