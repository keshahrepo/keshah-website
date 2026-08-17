import { NextResponse } from "next/server";
import { getRecentMessages, getUserProfile, sampleAadiVoiceExamples, saveDraft } from "@/lib/support/repo";
import { generateDraft } from "@/lib/support/draft";
import { getActivePrompts } from "@/lib/support/prompts";
import { requireDashboardSession } from "@/lib/support/auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const [profile, messages, voiceExamples, prompts] = await Promise.all([
      getUserProfile(userId),
      getRecentMessages(userId, 20),
      sampleAadiVoiceExamples(12),
      getActivePrompts(),
    ]);

    const draft = await generateDraft({ profile, conversation: messages, voiceExamples, prompts });
    await saveDraft(userId, draft);

    return NextResponse.json({
      ok: true,
      draft: {
        content: draft.content,
        category: draft.category,
        model: draft.model,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
    console.error("[support/regenerate] error for", userId, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
