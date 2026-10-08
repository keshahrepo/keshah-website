import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getRecentMessages, getUserProfile } from "@/lib/support/repo";
import { requireDashboardSession } from "@/lib/support/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/support/thread/:userId — the whole support conversation (latest 200
// messages, photos included), the user's profile, and the drafted reply.
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { userId } = await params;
    const [messages, profile, doc] = await Promise.all([
      getRecentMessages(userId, 200),
      getUserProfile(userId),
      getFirebaseAdmin().db.collection("support").doc(userId).get(),
    ]);
    const draft = (doc.get("last_draft") ?? null) as Record<string, unknown> | null;
    return NextResponse.json({
      userId,
      profile,
      draft: draft ? { content: String(draft.content ?? ""), category: draft.category ?? null } : null,
      messages: messages.map((m) => ({
        fromId: m.fromId,
        content: m.content,
        type: m.type,
        timestampMs: m.timestamp?.toMillis() ?? null,
        attachments: m.attachments ?? [],
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
