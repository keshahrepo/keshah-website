import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { CreatorDataError } from "@/lib/creators/db";
import { removeCreator, type RemoveReason } from "@/lib/creators/remove";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/creators/:id/remove { reason: not_interested | no_onboarding | not_a_fit | other, note? } (nothing is sent to them)
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string; note?: string };
  try {
    return NextResponse.json(await removeCreator(id, { reason: String(body.reason ?? "") as RemoveReason, note: body.note }));
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("remove creator failed:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
