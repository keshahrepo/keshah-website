import { NextRequest, NextResponse } from "next/server";
import { signedReadUrl } from "@/lib/creators/db";
import { errorResponse, requireCreator } from "../_auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const c = creator.contract;
    return NextResponse.json({
      status: c.status,
      signed_at: c.signed_at ?? null,
      download_url: c.pdf_path ? await signedReadUrl(c.pdf_path) : null,
    });
  } catch (e) {
    return errorResponse(e, "contract");
  }
}
