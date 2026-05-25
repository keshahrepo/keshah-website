import { NextResponse } from "next/server";
import { listAwaitingConversations, getRecentMessages, getUserProfile } from "@/lib/support/repo";
import { requireDashboardSession } from "@/lib/support/auth";

export const maxDuration = 30;

export async function GET() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const awaiting = await listAwaitingConversations({ limit: 100 });

  // Hydrate each conversation with profile + last 5 messages for the UI.
  // Parallel because each round-trip is independent.
  const cards = await Promise.all(
    awaiting.map(async (convo) => {
      const [profile, messages] = await Promise.all([
        getUserProfile(convo.userId),
        getRecentMessages(convo.userId, 5),
      ]);
      return {
        userId: convo.userId,
        profile,
        recentMessages: messages.map((m) => ({
          fromId: m.fromId,
          content: m.content,
          timestampMs: m.timestamp?.toMillis() ?? null,
        })),
        lastUpdateMs: convo.lastUpdateAt?.toMillis() ?? null,
        draft: convo.draft
          ? {
              content: convo.draft.content,
              category: convo.draft.category,
              generatedAtMs: convo.draft.generated_at.toMillis(),
            }
          : null,
      };
    })
  );

  return NextResponse.json({ conversations: cards });
}
