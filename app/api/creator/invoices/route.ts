import { NextRequest, NextResponse } from "next/server";
import { CreatorDataError, creatorToday, hasStarted, draftOrGetInvoice, getInvoice, listInvoices, submitInvoice } from "@/lib/creators/db";
import { invoiceView } from "@/lib/creators/invoice-auto";
import { addMonths, monthOf } from "@/lib/creators/pay";
import { errorResponse, requireCreator } from "../_auth";

export const dynamic = "force-dynamic";

// GET: last month's invoice (drafted on first view, from the 1st) + history.
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const lastMonth = addMonths(monthOf(creatorToday(creator)), -1);
    const startedBy = hasStarted(creator) && creator.start_date <= `${lastMonth}-31`;
    const current = startedBy ? await draftOrGetInvoice(creator.id, lastMonth) : null;
    const history = await listInvoices(creator.id);
    // Each invoice carries auto_submitted, dispute_until, disputed_at, can_dispute,
    // paid_by / paid_by_date and dispute_by_date (see invoiceView).
    const view = (i: typeof current) => (i ? invoiceView(i, creator.timezone) : null);
    return NextResponse.json({ last_month: lastMonth, current: view(current), history: history.map((i) => view(i)!) });
  } catch (e) {
    return errorResponse(e, "invoices");
  }
}

// POST { action: "submit", number } — legacy manual submit. Invoices are now
// self-billed by /api/cron/creator-invoices; kept for older app builds.
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
