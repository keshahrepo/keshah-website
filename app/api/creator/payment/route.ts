import { NextRequest, NextResponse } from "next/server";
import { getCreatorPaymentView, saveBankDetails } from "@/lib/creators/payments";
import { errorResponse, requestMeta, requireCreator } from "../_auth";

export const dynamic = "force-dynamic";

// GET: payment setup status (summary only; full numbers are never sent back).
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    return NextResponse.json(await getCreatorPaymentView(creator.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e, "payment");
  }
}

// POST { action: "bank", account_holder, bank_name, routing_number, account_number, account_number_confirm, account_type }
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action !== "bank") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await saveBankDetails(creator.id, body, requestMeta(req));
    return NextResponse.json(await getCreatorPaymentView(creator.id));
  } catch (e) {
    return errorResponse(e, "payment bank");
  }
}
