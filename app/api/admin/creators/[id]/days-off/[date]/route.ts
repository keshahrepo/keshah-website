import { NextRequest, NextResponse } from "next/server";
import { CREATORS_COLLECTION, db, requireAdmin } from "@/lib/creators/admin";

export const dynamic = "force-dynamic";

// PATCH /api/admin/creators/:id/days-off/:date { status: "approved" | "declined" }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; date: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id, date } = await params;
  const { status } = (await req.json().catch(() => ({}))) as { status?: string };
  if (status !== "approved" && status !== "declined" && status !== "requested") {
    return NextResponse.json({ error: "status must be approved, declined or requested" }, { status: 400 });
  }
  const ref = db().collection(CREATORS_COLLECTION).doc(id).collection("days_off").doc(date);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await ref.update({ status, decided_at: status === "requested" ? null : new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
