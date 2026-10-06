import { NextRequest, NextResponse } from "next/server";
import { previewTaxForm } from "@/lib/creators/payments";
import { errorResponse, requireCreator } from "../../../_auth";

export const dynamic = "force-dynamic";

// POST { form: "w9" | "w8ben", fields }: the filled official form, unsigned and
// watermarked, so the creator sees exactly what they'll sign. Nothing is stored.
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const body = (await req.json().catch(() => ({}))) as { form?: string; fields?: Record<string, unknown> };
    const form = body.form === "w8ben" ? "w8ben" : "w9";
    const pdf = await previewTaxForm(form, body.fields ?? {});
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="preview-${form === "w9" ? "W-9" : "W-8BEN"}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e, "tax preview");
  }
}
