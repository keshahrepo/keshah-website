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
  requireAdmin,
  sanitizeProfile,
  summaryFor,
  todayIn,
} from "@/lib/creators/admin";
import { addMonths, completedMonthsAsOf, draftInvoiceLines, nextLevel } from "@/lib/creators/pay";

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
  const h = await loadHistory(id);
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
    postingDays: h.postingRaw.filter((p) => p.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date)),
    daysOff: [...h.daysOff].sort((a, b) => b.date.localeCompare(a.date)),
    bonusClaims: [...h.bonusClaims].sort((a, b) => (b.posted_on || "").localeCompare(a.posted_on || "")),
    adjustments: [...h.adjustments].sort((a, b) => b.month.localeCompare(a.month)),
    invoices: h.invoices,
    onboarding: h.onboarding,
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
  // Marking a contract signed without a date stamps it now.
  if (updates["contract.status"] === "signed" && body.contract && !(body.contract as Record<string, unknown>).signed_at) {
    if (!snap.data()?.contract?.signed_at) updates["contract.signed_at"] = new Date().toISOString();
  }
  await ref.update(updates);
  return NextResponse.json({ ok: true });
}
