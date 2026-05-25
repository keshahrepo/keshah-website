import { listAwaitingConversations, getRecentMessages, getUserProfile } from "@/lib/support/repo";
import SupportReviewClient, { type CardData } from "./SupportReviewClient";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const awaiting = await listAwaitingConversations({ limit: 100 });

  // Hydrate each conversation with profile + last 5 messages.
  const cards: CardData[] = await Promise.all(
    awaiting.map(async (convo) => {
      const [profile, messages] = await Promise.all([
        getUserProfile(convo.userId),
        getRecentMessages(convo.userId, 5),
      ]);
      return {
        userId: convo.userId,
        profile: {
          email: profile.email,
          firstName: profile.firstName,
          gender: profile.gender,
          treatmentStage: profile.treatmentStage,
          daysIntoProgram: profile.daysIntoProgram,
          region: profile.region,
          plan: profile.plan,
        },
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

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>
          Support drafts
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
          {cards.length} conversation{cards.length === 1 ? "" : "s"} waiting for a reply
        </p>
      </header>
      <SupportReviewClient initialCards={cards} />
    </div>
  );
}
