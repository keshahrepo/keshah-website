import { NextRequest, NextResponse } from "next/server";
import { getInvoice } from "@/lib/creators/db";
import { errorResponse, requireCreator } from "../../_auth";

export const dynamic = "force-dynamic";

// GET: one invoice of the signed-in creator, with the parties for printing.
export async function GET(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const { number } = await params;
    const invoice = await getInvoice(creator.id, decodeURIComponent(number));
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    return NextResponse.json({
      invoice,
      from: {
        legal_name: invoice.creator_legal_name || creator.legal_name || creator.name,
        email: creator.email,
      },
      bill_to: {
        legal_name: process.env.KESHAH_LEGAL_NAME || "KESHAH_LEGAL_NAME (not set)",
        address: process.env.KESHAH_LEGAL_ADDRESS || null,
      },
    });
  } catch (e) {
    return errorResponse(e, "invoice get");
  }
}
