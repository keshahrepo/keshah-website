import { NextRequest, NextResponse } from "next/server";
import {
  CREATORS_COLLECTION,
  db,
  getCreator,
  invoiceHtml,
  isDate,
  plain,
  requireAdmin,
} from "@/lib/creators/admin";
import { CreatorDataError, draftOrGetInvoice, returnInvoiceToDraft } from "@/lib/creators/db";
import type { Invoice } from "@/lib/creators/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; number: string }> };

// GET /api/admin/creators/:id/invoices/:number — printable invoice HTML.
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id, number } = await params;
  const creator = await getCreator(id);
  const snap = await db().collection(CREATORS_COLLECTION).doc(id).collection("invoices").doc(number).get();
  if (!creator || !snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const inv = plain(snap.data()) as unknown as Invoice;
  inv.number = inv.number || snap.id;
  return new NextResponse(invoiceHtml(creator, inv), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// PATCH /api/admin/creators/:id/invoices/:number
//   { action: "approve" }
//   { action: "unapprove" }      (back to submitted, only before payment)
//   { action: "mark_paid", paid_on: "yyyy-mm-dd", reference, proof_path }
//   { action: "resolve_dispute" } (clears the creator's "Something's off?" flag: dispute_resolved_at)
//   { action: "return_to_draft" } (correction: recalculates; the cron re-submits it and restarts the 3-day window)
// Approving during the creator's dispute window is allowed (the UI warns).
// Once paid the invoice is locked and every further change is refused.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id, number } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    paid_on?: string;
    reference?: string;
    proof_path?: string;
  };
  const ref = db().collection(CREATORS_COLLECTION).doc(id).collection("invoices").doc(number);

  try {
    if (body.action === "return_to_draft") {
      try {
        await returnInvoiceToDraft(id, number);
      } catch (e) {
        if (e instanceof CreatorDataError) throw new HttpError(e.status, e.message);
        throw e;
      }
      return NextResponse.json({ ok: true });
    }
    // Approving a draft the creator never submitted: recalculate it first so
    // the approved amount reflects the current posting log, claims and
    // adjustments (a draft's lines are only refreshed when it's viewed), and
    // snapshot the payee name the way a creator submit does.
    let payeeName = "";
    if (body.action === "approve") {
      const cur = await ref.get();
      if (cur.exists && cur.data()!.status === "draft") {
        try {
          await draftOrGetInvoice(id, cur.data()!.month);
        } catch (e) {
          if (e instanceof CreatorDataError) throw new HttpError(e.status, e.message);
          throw e;
        }
      }
      const c = await getCreator(id);
      payeeName = c?.legal_name || c?.name || "";
    }
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError(404, "Invoice not found");
      const inv = snap.data()!;
      if (inv.locked || inv.status === "paid") throw new HttpError(409, "Invoice is paid and locked");
      const now = new Date().toISOString();

      if (body.action === "approve") {
        if (inv.status !== "submitted" && inv.status !== "draft") throw new HttpError(409, `Cannot approve a ${inv.status} invoice`);
        tx.update(ref, {
          status: "approved",
          approved_at: now,
          updated_at: now,
          ...(!inv.creator_legal_name && payeeName ? { creator_legal_name: payeeName } : {}),
        });
      } else if (body.action === "resolve_dispute") {
        if (!inv.disputed_at || inv.dispute_resolved_at) throw new HttpError(409, "No open dispute on this invoice");
        tx.update(ref, { dispute_resolved_at: now, updated_at: now });
      } else if (body.action === "unapprove") {
        if (inv.status !== "approved") throw new HttpError(409, "Only approved invoices can be un-approved");
        tx.update(ref, { status: "submitted", approved_at: null, updated_at: now });
      } else if (body.action === "mark_paid") {
        if (inv.status !== "approved") throw new HttpError(409, "Approve the invoice before marking it paid");
        if (!isDate(body.paid_on)) throw new HttpError(400, "Payment date (yyyy-mm-dd) is required");
        const reference = String(body.reference ?? "").trim();
        if (!reference) throw new HttpError(400, "Payment reference is required");
        const proof = String(body.proof_path ?? "").trim();
        if (proof && !proof.startsWith(`creators/${id}/payment_proof/`)) throw new HttpError(400, "Bad proof path");
        tx.update(ref, {
          status: "paid",
          // paid_at is the PAYMENT date the founder sent the ACH (noon UTC so the
          // calendar date survives any timezone), not the click time.
          paid_at: `${body.paid_on}T12:00:00.000Z`,
          payment_reference: reference.slice(0, 200),
          payment_proof_path: proof || null,
          payment_method: "amex_ach",
          marked_paid_at: now,
          locked: true,
          updated_at: now,
        });
      } else {
        throw new HttpError(400, "Unknown action");
      }
    });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  return NextResponse.json({ ok: true });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
