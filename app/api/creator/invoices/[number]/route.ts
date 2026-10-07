import { NextRequest, NextResponse } from "next/server";
import { getInvoice } from "@/lib/creators/db";
import { getContractSettings } from "@/lib/creators/contract";
import { invoiceView } from "@/lib/creators/invoice-auto";
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
    // Bill-to: env override, else the entity name the contracts are signed with.
    const entity = process.env.KESHAH_LEGAL_NAME || (await getContractSettings()).entity_name;
    return NextResponse.json({
      invoice: invoiceView(invoice, creator.timezone),
      from: {
        legal_name: invoice.creator_legal_name || creator.legal_name || creator.name,
        email: creator.email,
      },
      bill_to: {
        legal_name: entity,
        address: process.env.KESHAH_LEGAL_ADDRESS || null,
      },
    });
  } catch (e) {
    return errorResponse(e, "invoice get");
  }
}
