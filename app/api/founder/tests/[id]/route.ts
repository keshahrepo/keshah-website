// PATCH /api/founder/tests/[id]: { status?: "running"|"stopped", ended_on?, notes?, manual_result?, title? }
// DELETE /api/founder/tests/[id]
import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireDashboardSession } from "@/lib/support/auth";
import { TESTS_COLLECTION } from "@/lib/founder/tests";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { result_at: null };
  if (b.status === "running" || b.status === "stopped") patch.status = b.status;
  if (b.ended_on === null || (typeof b.ended_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.ended_on))) patch.ended_on = b.ended_on;
  if (typeof b.notes === "string") patch.notes = b.notes.slice(0, 500);
  if (typeof b.manual_result === "string") patch.manual_result = b.manual_result.slice(0, 300);
  if (typeof b.title === "string" && b.title.trim()) patch.title = b.title.trim().slice(0, 140);
  const ref = getFirebaseAdmin().db.collection(TESTS_COLLECTION).doc(id);
  if (!(await ref.get()).exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await ref.set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await getFirebaseAdmin().db.collection(TESTS_COLLECTION).doc(id).delete();
  return NextResponse.json({ ok: true });
}
