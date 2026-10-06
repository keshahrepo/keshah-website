import { NextRequest, NextResponse } from "next/server";
import { creatorTaxFormPdf } from "@/lib/creators/payments";
import { errorResponse, requestMeta, requireCreator } from "../../../_auth";

export const dynamic = "force-dynamic";

// GET: the creator's own signed tax form (decrypted on the fly, logged).
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const { pdf, filename } = await creatorTaxFormPdf(creator.id, requestMeta(req));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e, "tax document");
  }
}
