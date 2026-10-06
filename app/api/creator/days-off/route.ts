import { NextRequest, NextResponse } from "next/server";
import { getHistory, requestDayOff } from "@/lib/creators/db";
import { errorResponse, requireCreator, requireOnboarded } from "../_auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const { daysOff } = await getHistory(creator.id);
    return NextResponse.json({ days_off: [...daysOff].sort((a, b) => b.date.localeCompare(a.date)) });
  } catch (e) {
    return errorResponse(e, "days-off list");
  }
}

// POST { date, reason? }
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  const gated = await requireOnboarded(creator);
  if (gated) return gated;
  try {
    const b = await req.json();
    const day = await requestDayOff(creator.id, String(b.date ?? ""), { reason: b.reason });
    return NextResponse.json({ day_off: day });
  } catch (e) {
    return errorResponse(e, "days-off request");
  }
}
