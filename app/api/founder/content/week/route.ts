import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { approveWeek } from "@/lib/creators/content-db";
import { weekVoice } from "@/lib/creators/content-writer";
import { localDate } from "@/lib/creators/pay";
import { pageWeekOf } from "@/lib/founder/content";
import { contentError, jsonBody } from "../_shared";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/founder/content/week: voice {note, week_of?} | approve_all {week_of?} -> { week } (see CONTRACT).
export async function POST(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await jsonBody(req);
  const given = typeof body.week_of === "string" ? body.week_of : "";
  if (given && !/^\d{4}-\d{2}-\d{2}$/.test(given)) return NextResponse.json({ error: "week_of must be YYYY-MM-DD." }, { status: 400 });
  const weekOf = given || pageWeekOf(localDate(new Date().toISOString(), "America/New_York"));
  try {
    if (body.action === "voice") {
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (!note) return NextResponse.json({ error: "Say what to change." }, { status: 400 });
      return NextResponse.json({ week: await weekVoice(weekOf, note) });
    }
    if (body.action === "approve_all") return NextResponse.json({ week: await approveWeek(weekOf) });
    return NextResponse.json({ error: "action must be voice or approve_all." }, { status: 400 });
  } catch (e) {
    return contentError(e, "founder content week");
  }
}
