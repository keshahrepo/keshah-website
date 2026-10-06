import { NextRequest, NextResponse } from "next/server";
import { paidInvoices, requireAdmin } from "@/lib/creators/admin";

export const dynamic = "force-dynamic";

// GET /api/admin/creators/records/yearly — paid totals per creator per
// calendar year of PAYMENT (what a 1099-NEC reports).
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { creators, records } = await paidInvoices();
  const byId = new Map(creators.map((c) => [c.id, c]));
  const totals = new Map<string, { year: string; creatorId: string; creatorName: string; email: string; w9_on_file: boolean; invoices: number; totalCents: number }>();
  for (const r of records) {
    const year = r.paidOn.slice(0, 4);
    const key = `${year}|${r.creatorId}`;
    const c = byId.get(r.creatorId);
    const t = totals.get(key) ?? {
      year,
      creatorId: r.creatorId,
      creatorName: r.creatorName,
      email: c?.email ?? "",
      w9_on_file: !!c?.w9_on_file,
      invoices: 0,
      totalCents: 0,
    };
    t.invoices++;
    t.totalCents += r.invoice.total_cents || 0;
    totals.set(key, t);
  }
  const rows = [...totals.values()].sort((a, b) => b.year.localeCompare(a.year) || a.creatorName.localeCompare(b.creatorName));
  return NextResponse.json({ rows });
}
