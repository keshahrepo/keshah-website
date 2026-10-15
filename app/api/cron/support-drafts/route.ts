// Cron (every minute, see vercel.json): drafts replies in the background for
// support conversations waiting on Aadi, so the founder app's inbox and
// thread show a ready draft instead of generating one when a chat is opened.
// Up to DRAFTS_PER_RUN conversations per run, oldest waiting first; each is
// claimed in a transaction first (lib/support/background-drafts.ts), so
// overlapping runs never draft the same conversation twice.
//
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
// GET ?dry=1 lists who would be drafted without calling the model or writing.

import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { getRecentMessages, getUserProfile, listAwaitingConversations, sampleAadiVoiceExamples } from "@/lib/support/repo";
import { generateDraft } from "@/lib/support/draft";
import { getActivePrompts } from "@/lib/support/prompts";
import {
  claimForDraft,
  DRAFTS_PER_RUN,
  latestMessageMs,
  saveBackgroundDraft,
  selectConversationsToDraft,
} from "@/lib/support/background-drafts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONCURRENCY = 3;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    // Runs every minute: only chats active in the last week (older ones were
    // drafted when they came in). Reading all ~1,000 each run was ~1.4M reads/day.
    const awaiting = await listAwaitingConversations({ limit: 1000, since: new Date(Date.now() - 7 * 86_400_000) });
    const picked = selectConversationsToDraft(awaiting, Date.now(), DRAFTS_PER_RUN);
    if (dry || picked.length === 0) {
      return NextResponse.json({
        dry,
        awaiting: awaiting.length,
        selected: picked.map((c) => ({ userId: c.userId, lastMessageMs: latestMessageMs(c) })),
      });
    }

    // Loaded once per run and shared by every draft in it.
    const [voiceExamples, prompts] = await Promise.all([sampleAadiVoiceExamples(12), getActivePrompts()]);

    const results: Array<{ userId: string; status: string; category?: string; error?: string }> = [];
    const queue = [...picked];
    const worker = async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        const userId = c.userId;
        try {
          const claim = await claimForDraft(userId);
          if (!claim) {
            results.push({ userId, status: "skipped" });
            continue;
          }
          const [profile, messages] = await Promise.all([getUserProfile(userId), getRecentMessages(userId, 20)]);
          const draft = await generateDraft({ profile, conversation: messages, voiceExamples, prompts });
          const saved = await saveBackgroundDraft(userId, draft, claim.forMessageMs);
          results.push({ userId, status: saved ? "drafted" : "discarded", category: draft.category });
        } catch (e) {
          // The claim stays until it expires: a natural back-off before retrying.
          const error = e instanceof Error ? e.message : String(e);
          console.error("[cron/support-drafts]", userId, error);
          results.push({ userId, status: "failed", error });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, picked.length) }, worker));

    return NextResponse.json({
      awaiting: awaiting.length,
      drafted: results.filter((r) => r.status === "drafted").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
