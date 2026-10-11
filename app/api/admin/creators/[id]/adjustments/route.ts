import { NextRequest, NextResponse } from "next/server";
import { isMonth, requireAdmin } from "@/lib/creators/admin";
import { addAdjustment, CreatorDataError } from "@/lib/creators/db";

export const dynamic = "force-dynamic";

// POST /api/admin/creators/:id/adjustments { month, amount_cents, note }
// A month whose invoice already went in (submitted / approved / paid) can't
// change, so the adjustment moves to the next open month with a note saying
// so; the response's `month` / `carried_from` say where it landed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { month?: string; amount_cents?: number; note?: string };
  const amount = Math.round(Number(body.amount_cents));
  if (!isMonth(body.month)) return NextResponse.json({ error: "month must be yyyy-mm" }, { status: 400 });
  if (!Number.isFinite(amount) || amount === 0) return NextResponse.json({ error: "Amount must be non-zero" }, { status: 400 });
  const note = String(body.note ?? "").trim();
  if (!note) return NextResponse.json({ error: "A note is required" }, { status: 400 });
  try {
    const adj = await addAdjustment(id, { month: body.month, amount_cents: amount, note });
    return NextResponse.json({ id: adj.id, month: adj.month, carried_from: adj.carried_from ?? null, note: adj.note });
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
