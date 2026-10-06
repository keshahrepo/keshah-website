import { NextRequest, NextResponse } from "next/server";
import { creatorToday, getHistory, isYyyyMm } from "@/lib/creators/db";
import { monthOf } from "@/lib/creators/pay";
import { errorResponse, requireCreator } from "../_auth";
import { monthPayload } from "../_payload";

export const dynamic = "force-dynamic";

// GET ?month=yyyy-mm (default: the creator's current month)
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const q = req.nextUrl.searchParams.get("month");
    const month = isYyyyMm(q) ? q : monthOf(creatorToday(creator));
    const history = await getHistory(creator.id);
    return NextResponse.json(await monthPayload(creator, month, history));
  } catch (e) {
    return errorResponse(e, "month");
  }
}
