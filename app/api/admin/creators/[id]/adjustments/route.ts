import { NextRequest, NextResponse } from "next/server";
import { CREATORS_COLLECTION, db, isMonth, monthIsPaid, requireAdmin } from "@/lib/creators/admin";

export const dynamic = "force-dynamic";

// POST /api/admin/creators/:id/adjustments { month, amount_cents, note }
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
  if (await monthIsPaid(id, body.month)) {
    return NextResponse.json({ error: "That month's invoice is already paid and locked" }, { status: 409 });
  }
  const ref = await db()
    .collection(CREATORS_COLLECTION)
    .doc(id)
    .collection("adjustments")
    .add({ month: body.month, amount_cents: amount, note: note.slice(0, 500), created_at: new Date().toISOString() });
  return NextResponse.json({ id: ref.id });
}
