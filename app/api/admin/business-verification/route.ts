import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { getBusinessVerification, sanitizeBusinessInput, saveBusinessVerification } from "@/lib/creators/business-verification";

export const dynamic = "force-dynamic";

// GET: the TikTok business details (never the image itself). PUT: { address_line?, city?, state?, zip?, county?, image_b64? }.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json(await getBusinessVerification(), { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const res = sanitizeBusinessInput(body);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json(await saveBusinessVerification(res.updates));
}
