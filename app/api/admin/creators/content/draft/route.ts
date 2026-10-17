import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

// POST { week_of?: "YYYY-MM-DD" (a Monday) }: draft a week of content scripts now instead of waiting for
// Saturday. Sets Settings/creator_portal.content_draft_requested; the 10-minute niche-scan cron drafts it
// (lib/creators/content-schedule.ts). Without week_of: the next Monday (today when it is Monday).
// Fills empty slots only; a week that already has 10 live scripts is left as is. No founder push.
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { week_of?: unknown };
  const week = typeof b.week_of === "string" ? b.week_of : "";
  if (week && !(/^\d{4}-\d{2}-\d{2}$/.test(week) && new Date(`${week}T00:00:00Z`).getUTCDay() === 1)) {
    return NextResponse.json({ error: "week_of must be a Monday (YYYY-MM-DD)." }, { status: 400 });
  }
  await getFirebaseAdmin().db.collection("Settings").doc("creator_portal").set({ content_draft_requested: week || true }, { merge: true });
  return NextResponse.json({ ok: true, requested: week || "next Monday", within_minutes: 10 });
}
