import { NextRequest, NextResponse } from "next/server";
import { isOnboardingComplete, setOnboardingStep } from "@/lib/creators/db";
import type { OnboardingStep } from "@/lib/creators/types";
import { errorResponse, requireCreator } from "../_auth";

// POST { step, tiktok_handle?, instagram_handle?, video_id?, answers? }
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const body = await req.json();
    const { state, quiz } = await setOnboardingStep(creator.id, body.step as OnboardingStep, {
      tiktok_handle: body.tiktok_handle,
      instagram_handle: body.instagram_handle,
      video_id: body.video_id,
      answers: Array.isArray(body.answers) ? body.answers.map(Number) : undefined,
    });
    return NextResponse.json({ onboarding: { ...state, complete: isOnboardingComplete(state) }, quiz: quiz ?? null });
  } catch (e) {
    return errorResponse(e, "onboarding");
  }
}
