import { NextResponse } from "next/server";
import { listAwaitingConversations, getUserProfile } from "@/lib/support/repo";
import { requireDashboardSession } from "@/lib/support/auth";
import { draftCoversLatest, latestMessageMs } from "@/lib/support/background-drafts";

export const maxDuration = 30;

export async function GET() {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const awaiting = await listAwaitingConversations({ limit: 1000 });

  // Hydrate each conversation with the user's profile. The inbox row only
  // shows the latest message, which the conversation doc already carries.
  const cards = await Promise.all(
    awaiting.map(async (convo) => {
      const profile = await getUserProfile(convo.userId);
      return {
        userId: convo.userId,
        profile,
        recentMessages: [
          {
            fromId: convo.lastMessage.fromId,
            content: convo.lastMessage.content,
            timestampMs: convo.lastMessage.timestamp?.toMillis() ?? null,
          },
        ],
        lastUpdateMs: convo.lastUpdateAt?.toMillis() ?? null,
        draft: convo.draft
          ? {
              content: convo.draft.content,
              category: convo.draft.category,
              generatedAtMs: convo.draft.generated_at.toMillis(),
              // false = drafted before the user's latest message (a new one is on its way).
              current: draftCoversLatest(convo.draft, latestMessageMs(convo)),
            }
          : null,
      };
    })
  );

  return NextResponse.json({ conversations: cards });
}
