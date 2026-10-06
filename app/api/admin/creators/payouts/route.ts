import { NextRequest, NextResponse } from "next/server";
import { CREATORS_COLLECTION, db, isMonth, listCreators, plain, requireAdmin } from "@/lib/creators/admin";
import type { Invoice } from "@/lib/creators/types";

export const dynamic = "force-dynamic";

// GET /api/admin/creators/payouts?month=yyyy-mm — approved, unpaid invoices
// for the month (all months when omitted), plus what's still awaiting approval.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const qMonth = req.nextUrl.searchParams.get("month");
  const month = isMonth(qMonth) ? qMonth : null;
  const creators = await listCreators();
  const rows: { creatorId: string; legalName: string; email: string; invoice: Invoice }[] = [];
  await Promise.all(
    creators.map(async (c) => {
      let q: FirebaseFirestore.Query = db().collection(CREATORS_COLLECTION).doc(c.id).collection("invoices");
      if (month) q = q.where("month", "==", month);
      const snap = await q.get();
      for (const doc of snap.docs) {
        const inv = plain(doc.data()) as unknown as Invoice;
        inv.number = inv.number || doc.id;
        if (inv.status === "approved" || inv.status === "submitted") {
          rows.push({ creatorId: c.id, legalName: c.legal_name || c.name, email: c.email, invoice: inv });
        }
      }
    }),
  );
  rows.sort((a, b) => a.legalName.localeCompare(b.legalName) || a.invoice.number.localeCompare(b.invoice.number));
  const approved = rows.filter((r) => r.invoice.status === "approved");
  return NextResponse.json({
    month,
    approved,
    awaitingApproval: rows.filter((r) => r.invoice.status === "submitted"),
    totalCents: approved.reduce((s, r) => s + (r.invoice.total_cents || 0), 0),
  });
}
