import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { CreatorDataError } from "@/lib/creators/db";
import { adminTaxFormPdf } from "@/lib/creators/payments";
import { adminActor } from "../../../_actor";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// GET: streams the decrypted signed W-9 / W-8BEN. Every download is logged.
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const { pdf, filename } = await adminTaxFormPdf(id, await adminActor(req));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("tax form download error:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
