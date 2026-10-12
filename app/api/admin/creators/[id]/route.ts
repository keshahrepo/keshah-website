import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  CREATORS_COLLECTION,
  attributionFor,
  calendarFor,
  db,
  getCreator,
  isMonth,
  loadHistory,
  payProfileOf,
  progressFor,
  requireAdmin,
  sanitizeProfile,
  summaryFor,
  todayIn,
} from "@/lib/creators/admin";
import { addMonths, completedMonthsAsOf, draftInvoiceLines, nextLevel, trialStatus } from "@/lib/creators/pay";
import { listContractEvents } from "@/lib/creators/contract";
import { creatorDocs, mapCreatorStatus, markContractStepDone } from "@/lib/creators/db";
import { campaignTagClash, handleOwner } from "@/lib/creators/uniqueness";
import { offboardCreator } from "@/lib/creators/offboard";
import { notifyLinkReady } from "@/lib/creators/lifecycle-notify";
import { offerSummary } from "@/lib/creators/deadline";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/creators/:id?month=yyyy-mm — everything the detail page needs.
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const creator = await getCreator(id);
  if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const today = todayIn(creator.timezone);
  const qMonth = req.nextUrl.searchParams.get("month");
  const month = isMonth(qMonth) ? qMonth : today.slice(0, 7);
  const [h, contractEvents] = await Promise.all([
    loadHistory(id, { contractSigned: creator.contract.status === "signed" }),
    listContractEvents(id).catch(() => []),
  ]);
  const summary = summaryFor(creator, h, month);
  const hist = { postingDays: h.postingDays, daysOff: h.daysOff };
  const prev = addMonths(month, -1);
  const attribution = await attributionFor(creator.campaign_tags, Date.parse(`${prev}-01T00:00:00Z`));

  return NextResponse.json({
    creator,
    month,
    today,
    summary,
    draftLines: summary ? draftInvoiceLines(summary) : [],
    completedMonths: creator.pay_ready ? completedMonthsAsOf(payProfileOf(creator), month, hist) : null,
    nextLevel: creator.pay_ready ? nextLevel(payProfileOf(creator), hist, month) : null,
    calendar: calendarFor(creator, h, month),
    trial: creator.trial_plan && creator.pay_ready ? trialStatus(h.postingDays, payProfileOf(creator)) : null,
    postingDays: h.postingRaw.filter((p) => p.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date)),
    daysOff: [...h.daysOff].sort((a, b) => b.date.localeCompare(a.date)),
    bonusClaims: [...h.bonusClaims].sort((a, b) => (b.posted_on || "").localeCompare(a.posted_on || "")),
    adjustments: [...h.adjustments].sort((a, b) => b.month.localeCompare(a.month)),
    invoices: h.invoices,
    onboarding: h.onboarding,
    // Founder app Progress timeline: Accepted -> ... -> Trial / Promoted / Ended.
    progress: progressFor(creator, h),
    // 72-hour contract deadline (null for creators without one): drives "Give 48 more hours" / "Withdraw offer".
    offer: offerSummary(
      { status: creator.status, contract: creator.contract, contract_deadline_at: creator.contract_deadline_at, contract_reminder_sent_at: creator.contract_reminder_sent_at, withdrawn_at: creator.withdrawn_at },
      new Date(),
    ),
    contractEvents,
    attribution,
  });
}

// PATCH /api/admin/creators/:id — update profile / contract / W-9 fields.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const res = sanitizeProfile(body);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  if (!Object.keys(res.updates).length) return NextResponse.json({ ok: true });

  const ref = db().collection(CREATORS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updates: Record<string, unknown> = { ...res.updates, updated_at: FieldValue.serverTimestamp() };
  if (updates.status !== undefined && updates.status !== snap.data()?.status) {
    updates.status_changed_at = FieldValue.serverTimestamp();
  }
  if (typeof updates.email === "string" && updates.email !== snap.data()?.email) {
    const dup = await db().collection(CREATORS_COLLECTION).where("email", "==", updates.email).limit(2).get();
    if (dup.docs.some((d) => d.id !== id)) {
      return NextResponse.json({ error: "Another creator already uses that email" }, { status: 409 });
    }
  }
  // Campaign tags and handles belong to one creator: a shared tag would count
  // installs for both, a shared handle would count posts for both.
  if (Array.isArray(updates.campaign_tags) || updates.tiktok_handle || updates.instagram_handle) {
    const docs = await creatorDocs();
    const clash = Array.isArray(updates.campaign_tags) ? campaignTagClash(docs, id, updates.campaign_tags as string[]) : null;
    if (clash) return NextResponse.json({ error: `${clash.owner} already has the campaign tag "${clash.tag}".` }, { status: 409 });
    for (const k of ["tiktok_handle", "instagram_handle"] as const) {
      const h = typeof updates[k] === "string" ? (updates[k] as string) : "";
      const owner = h ? handleOwner(docs, id, h) : null;
      if (owner) return NextResponse.json({ error: `${owner} already uses @${h.replace(/^@+/, "")}.` }, { status: 409 });
    }
  }
  // The contract's name match (B9) uses the legal name, so it's fixed once they've signed.
  if (typeof updates.legal_name === "string" && updates.legal_name !== snap.data()?.legal_name && snap.data()?.contract?.status === "signed") {
    return NextResponse.json({ error: "They've signed their contract, so their legal name can't change here." }, { status: 409 });
  }
  // A portal e-signed contract is final: no manual edits over it.
  const existingContract = (snap.data()?.contract ?? {}) as { signed_sha256?: string };
  if (existingContract.signed_sha256 && Object.keys(updates).some((k) => k.startsWith("contract."))) {
    return NextResponse.json({ error: "This contract was e-signed and is locked." }, { status: 409 });
  }
  // Marking a contract signed without a date stamps it now.
  if (updates["contract.status"] === "signed" && body.contract && !(body.contract as Record<string, unknown>).signed_at) {
    if (!snap.data()?.contract?.signed_at) updates["contract.signed_at"] = new Date().toISOString();
  }
  // Ending them goes through offboarding (group removal, founder password task, final invoice).
  const ending = updates.status === "ended" && mapCreatorStatus(snap.data()?.status) !== "ended";
  if (ending) delete updates.status;
  await ref.update(updates);
  let offboard: Awaited<ReturnType<typeof offboardCreator>> | null = null;
  if (ending) offboard = await offboardCreator(id, "status", typeof updates.ended_on === "string" ? { endedOn: updates.ended_on } : {});
  // First tracking link while they're setting up: tell them it's there to add to their bio.
  if (typeof updates.tracking_url === "string" && updates.tracking_url && !String(snap.data()?.tracking_url ?? "") && mapCreatorStatus(snap.data()?.status) === "onboarding") {
    await notifyLinkReady(id);
  }
  if (updates["contract.status"] === "signed") {
    // Paper contract recorded by admin: tick the portal's "Sign your contract" step too.
    await markContractStepDone(id, String(updates["contract.signed_at"] ?? snap.data()?.contract?.signed_at ?? new Date().toISOString())).catch((e) =>
      console.error("contract step update failed:", e),
    );
  }
  return NextResponse.json({ ok: true, ...(offboard ? { offboard } : {}) });
}
