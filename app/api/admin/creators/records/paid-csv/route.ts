import { NextRequest, NextResponse } from "next/server";
import { PAYMENT_METHOD_LABEL, isDate, paidInvoices, requireAdmin, toCsv } from "@/lib/creators/admin";

export const dynamic = "force-dynamic";

// GET /api/admin/creators/records/paid-csv?from=&to= — every paid invoice as CSV.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const from = isDate(sp.get("from")) ? sp.get("from")! : undefined;
  const to = isDate(sp.get("to")) ? sp.get("to")! : undefined;
  const { records } = await paidInvoices(from, to);
  const csv = toCsv([
    ["date", "creator", "invoice_number", "period", "amount_usd", "method", "reference"],
    ...records.map((r) => [
      r.paidOn,
      r.creatorName,
      r.invoice.number,
      r.invoice.month,
      ((r.invoice.total_cents || 0) / 100).toFixed(2),
      PAYMENT_METHOD_LABEL,
      r.invoice.payment_reference ?? "",
    ]),
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="creator-payments${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.csv"`,
    },
  });
}
