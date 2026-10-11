import { NextRequest, NextResponse } from "next/server";
import { CREATORS_COLLECTION, db, isDate, requireAdmin } from "@/lib/creators/admin";
import { approvedClaimDates } from "@/lib/creators/lifecycle";
import { notifyBonusDecision } from "@/lib/creators/lifecycle-notify";
import type { BonusClaim } from "@/lib/creators/types";

export const dynamic = "force-dynamic";

// PATCH /api/admin/creators/:id/bonus-claims/:claimId
// { status?, views_claimed?, posted_on?, crossed_100k_on?, crossed_1m_on?, admin_note? }
// Approving a claim with no milestone date records one (lifecycle.ts approvedClaimDates):
// the claimed level, dated the day it was sent (kept inside the 30-day window).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; claimId: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id, claimId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const u: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!["claimed", "approved", "rejected"].includes(String(body.status))) {
      return NextResponse.json({ error: "Bad status" }, { status: 400 });
    }
    u.status = body.status;
    u.reviewed_at = new Date().toISOString();
  }
  if (body.views_claimed !== undefined) {
    const n = Number(body.views_claimed);
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "Bad views" }, { status: 400 });
    u.views_claimed = Math.round(n);
  }
  for (const k of ["posted_on", "crossed_100k_on", "crossed_1m_on"]) {
    if (body[k] === undefined) continue;
    if (body[k] && !isDate(body[k])) return NextResponse.json({ error: `${k} must be yyyy-mm-dd` }, { status: 400 });
    if (!body[k] && k === "posted_on") return NextResponse.json({ error: "posted_on is required" }, { status: 400 });
    u[k] = body[k] || null;
  }
  if (body.admin_note !== undefined) u.admin_note = String(body.admin_note ?? "").slice(0, 2000);
  if (!Object.keys(u).length) return NextResponse.json({ ok: true });

  const creatorRef = db().collection(CREATORS_COLLECTION).doc(id);
  const ref = creatorRef.collection("bonus_claims").doc(claimId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const before = snap.data() as BonusClaim;
  // Approving without milestone dates would pay $0 (the calculator needs them),
  // so the server records the claimed level's date for any client.
  if (u.status === "approved") {
    const merged = { ...before, ...u } as BonusClaim;
    const tz = String((await creatorRef.get()).get("timezone") ?? "") || "America/New_York";
    Object.assign(u, approvedClaimDates(merged, tz));
  }
  await ref.update(u);
  // Tell the creator when the decision changed (push is never allowed to fail this).
  let told: string | undefined;
  if ((u.status === "approved" || u.status === "rejected") && before.status !== u.status) {
    told = await notifyBonusDecision(id, u.status === "approved", String(before.platform ?? ""));
  }
  return NextResponse.json({ ok: true, ...(u.crossed_100k_on ? { crossed_100k_on: u.crossed_100k_on } : {}), ...(u.crossed_1m_on ? { crossed_1m_on: u.crossed_1m_on } : {}), ...(told ? { told } : {}) });
}
