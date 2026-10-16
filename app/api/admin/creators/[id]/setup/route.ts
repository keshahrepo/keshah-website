import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { CreatorDataError } from "@/lib/creators/db";
import { endSetup, extendSetup } from "@/lib/creators/setup";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/creators/:id/setup { action: "extend" | "end" }
//   extend: "Give 3 more days" on the 3-day setup deadline (no message to them)
//   end:    "End agreement" for a creator who didn't finish setup (offboard + email)
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "extend") return NextResponse.json(await extendSetup(id));
    if (body.action === "end") return NextResponse.json(await endSetup(id));
    return NextResponse.json({ error: "action must be extend or end" }, { status: 400 });
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("setup action failed:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
