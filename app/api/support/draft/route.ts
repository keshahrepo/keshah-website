import { NextResponse } from "next/server";
import { listAwaitingConversations, getRecentMessages, getUserProfile, sampleAadiVoiceExamples, saveDraft } from "@/lib/support/repo";
import { generateDraft } from "@/lib/support/draft";
import { requireCronSecret } from "@/lib/support/auth";

// Long-running route — cron iterates over every awaiting conversation
// and calls the Anthropic API once per conversation. 300s is the Vercel
// Pro limit. If we ever exceed it we'll need to paginate.
export const maxDuration = 300;

// Skip drafting if there's already a draft generated within this window.
// Avoids re-burning tokens on a conversation whose state hasn't changed.
const DRAFT_FRESH_HOURS = 8;

export async function POST(req: Request) {
  if (!requireCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const awaiting = await listAwaitingConversations({ limit: 200 });
  // Sample voice examples once and reuse across all drafts in this batch —
  // cheaper, and gives the model a consistent style baseline per run.
  const voiceExamples = await sampleAadiVoiceExamples(12);

  const freshCutoff = Date.now() - DRAFT_FRESH_HOURS * 3600_000;
  const results: { userId: string; ok: boolean; error?: string; category?: string }[] = [];

  for (const convo of awaiting) {
    try {
      // If we already drafted recently and the user hasn't messaged since,
      // skip. last_update_at moves whenever the user sends a new message.
      if (
        convo.draft &&
        convo.draft.generated_at.toMillis() > freshCutoff &&
        convo.lastUpdateAt &&
        convo.draft.generated_at.toMillis() > convo.lastUpdateAt.toMillis()
      ) {
        results.push({ userId: convo.userId, ok: true, category: convo.draft.category + " (cached)" });
        continue;
      }

      const [profile, messages] = await Promise.all([
        getUserProfile(convo.userId),
        getRecentMessages(convo.userId, 20),
      ]);

      const draft = await generateDraft({
        profile,
        conversation: messages,
        voiceExamples,
      });

      await saveDraft(convo.userId, draft);
      results.push({ userId: convo.userId, ok: true, category: draft.category });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      results.push({ userId: convo.userId, ok: false, error: err });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  return NextResponse.json({
    drafted: ok,
    failed: results.length - ok,
    total_awaiting: awaiting.length,
    results,
  });
}
