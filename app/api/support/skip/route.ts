import { NextResponse } from "next/server";
import { deferConversation } from "@/lib/support/repo";
import { requireDashboardSession } from "@/lib/support/auth";

export const maxDuration = 10;

export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { userId?: string; hours?: number } | null;
  const userId = body?.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const hours = typeof body?.hours === "number" && body.hours > 0 ? body.hours : 24;
  await deferConversation(userId, hours);
  return NextResponse.json({ ok: true, hours });
}
