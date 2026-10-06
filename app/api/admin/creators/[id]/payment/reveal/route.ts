import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { CreatorDataError } from "@/lib/creators/db";
import { revealBankDetails } from "@/lib/creators/payments";
import { adminActor } from "../../../_actor";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// POST: decrypted bank details for a 60 second display. Logged to private/payment/reveal_log first.
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const bank = await revealBankDetails(id, await adminActor(req));
    return NextResponse.json({ bank }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("reveal bank error:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
