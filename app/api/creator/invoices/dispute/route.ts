import { NextRequest, NextResponse } from "next/server";
import { notifyFounder } from "@/lib/staff";
import { CreatorDataError, disputeInvoice } from "@/lib/creators/db";
import { disputeFounderEmail, invoiceView } from "@/lib/creators/invoice-auto";
import { emailConfigured, sendEmail } from "@/lib/email";
import { errorResponse, requireCreator } from "../../_auth";

export const dynamic = "force-dynamic";

// POST { number, note } — "Something's off?" on an auto-submitted invoice.
// Allowed only while status is submitted and now < dispute_until. Flags the
// invoice (disputed_at, dispute_note; status stays submitted) and emails the founder.
// Cookie or mobile Bearer auth (requireCreator).
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const b = (await req.json().catch(() => ({}))) as { number?: unknown; note?: unknown };
    const number = String(b.number ?? "").trim();
    if (!number) throw new CreatorDataError("number is required");
    const inv = await disputeInvoice(creator.id, number, b.note);
    await notifyFounder({ title: `${creator.name || "A creator"} disputed an invoice`, body: String(inv.dispute_note || "Open it to see why.").slice(0, 140), data: { type: "founder_dispute", id: creator.id } });
    const founder = process.env.KESHAH_GMAIL_USER;
    if (founder && emailConfigured()) {
      const site = process.env.NEXT_PUBLIC_SITE_URL || "https://www.keshah.com";
      const mail = disputeFounderEmail(creator, inv, inv.dispute_note || "", site);
      await sendEmail({ to: founder, subject: mail.subject, text: mail.text }).catch((e) =>
        console.error("invoice dispute email failed:", e),
      );
    }
    return NextResponse.json({ invoice: invoiceView(inv, creator.timezone) });
  } catch (e) {
    return errorResponse(e, "invoice dispute");
  }
}
