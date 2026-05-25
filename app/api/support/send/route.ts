import { NextResponse } from "next/server";
import { sendReply } from "@/lib/support/repo";
import { requireDashboardSession } from "@/lib/support/auth";

export const maxDuration = 30;

export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { userId?: string; content?: string } | null;
  const userId = body?.userId?.trim();
  const content = body?.content?.trim();
  if (!userId || !content) {
    return NextResponse.json({ error: "userId and content are required" }, { status: 400 });
  }

  await sendReply(userId, content);
  return NextResponse.json({ ok: true });
}
