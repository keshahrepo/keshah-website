import { NextResponse } from "next/server";
import { getRecentMessages, getUserProfile, sampleAadiVoiceExamples, saveDraft } from "@/lib/support/repo";
import { generateDraft } from "@/lib/support/draft";
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

  const [profile, messages, voiceExamples] = await Promise.all([
    getUserProfile(userId),
    getRecentMessages(userId, 20),
    sampleAadiVoiceExamples(12),
  ]);

  const draft = await generateDraft({ profile, conversation: messages, voiceExamples });
  await saveDraft(userId, draft);

  return NextResponse.json({
    ok: true,
    draft: {
      content: draft.content,
      category: draft.category,
      model: draft.model,
    },
  });
}
