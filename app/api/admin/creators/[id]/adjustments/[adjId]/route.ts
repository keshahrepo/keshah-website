import { NextRequest, NextResponse } from "next/server";
import { CREATORS_COLLECTION, db, monthIsPaid, requireAdmin } from "@/lib/creators/admin";

export const dynamic = "force-dynamic";

// DELETE /api/admin/creators/:id/adjustments/:adjId — only while the month is unpaid.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; adjId: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id, adjId } = await params;
  const ref = db().collection(CREATORS_COLLECTION).doc(id).collection("adjustments").doc(adjId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (await monthIsPaid(id, String(snap.data()?.month ?? ""))) {
    return NextResponse.json({ error: "That month's invoice is already paid and locked" }, { status: 409 });
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}
