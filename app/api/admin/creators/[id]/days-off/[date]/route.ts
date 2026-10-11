import { NextRequest, NextResponse } from "next/server";
import { CREATORS_COLLECTION, db, isDate, requireAdmin } from "@/lib/creators/admin";
import { setDayOffStatus } from "@/lib/creators/db";
import { notifyDayOffDecision } from "@/lib/creators/lifecycle-notify";

export const dynamic = "force-dynamic";

// PATCH /api/admin/creators/:id/days-off/:date
//   { status: "approved" | "declined" | "requested" }   decide a request
//   { status: "approved", excuse: true }                "Excuse this day": a missed weekday counts as an approved day off
// The creator gets a push when a request is approved / declined or a day is excused.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; date: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id, date } = await params;
  const { status, excuse } = (await req.json().catch(() => ({}))) as { status?: string; excuse?: boolean };
  if (status !== "approved" && status !== "declined" && status !== "requested") {
    return NextResponse.json({ error: "status must be approved, declined or requested" }, { status: 400 });
  }
  if (!isDate(date)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
  const ref = db().collection(CREATORS_COLLECTION).doc(id).collection("days_off").doc(date);
  const snap = await ref.get();
  const excusing = excuse === true && status === "approved";
  if (!snap.exists && !excusing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (excusing) {
    await setDayOffStatus(id, date, "approved");
    await ref.update({ excused: true, reason: snap.exists ? snap.get("reason") ?? "Excused by KESHAH" : "Excused by KESHAH" });
  } else {
    await ref.update({ status, decided_at: status === "requested" ? null : new Date().toISOString() });
  }
  let told: string | undefined;
  if (status !== "requested" && (excusing || snap.get("status") !== status)) told = await notifyDayOffDecision(id, date, status, excusing && snap.get("status") !== "requested");
  return NextResponse.json({ ok: true, ...(told ? { told } : {}) });
}
