import { NextRequest, NextResponse } from "next/server";
import { CreatorDataError, creatorToday, draftOrGetInvoice, getInvoice, listInvoices, submitInvoice } from "@/lib/creators/db";
import { addMonths, monthOf } from "@/lib/creators/pay";
import { errorResponse, requireCreator } from "../_auth";

export const dynamic = "force-dynamic";

// GET: last month's invoice (drafted on first view, from the 1st) + history.
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const lastMonth = addMonths(monthOf(creatorToday(creator)), -1);
    const startedBy = creator.start_date <= `${lastMonth}-31`;
    const current = startedBy ? await draftOrGetInvoice(creator.id, lastMonth) : null;
    const history = await listInvoices(creator.id);
    return NextResponse.json({ last_month: lastMonth, current, history });
  } catch (e) {
    return errorResponse(e, "invoices");
  }
}

// POST { action: "submit", number }
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const b = await req.json();
    if (b.action !== "submit") throw new CreatorDataError("Unknown action");
    const inv = await getInvoice(creator.id, String(b.number ?? ""));
    if (!inv) throw new CreatorDataError("Invoice not found", 404);
    if (inv.month >= monthOf(creatorToday(creator))) {
      throw new CreatorDataError("You can submit this invoice once the month is over.", 409);
    }
    return NextResponse.json({ invoice: await submitInvoice(creator.id, inv.number) });
  } catch (e) {
    return errorResponse(e, "invoice submit");
  }
}
