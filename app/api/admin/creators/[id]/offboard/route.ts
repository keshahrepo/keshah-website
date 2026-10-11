import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { CreatorDataError } from "@/lib/creators/db";
import { markPasswordsReset } from "@/lib/creators/offboard";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/creators/:id/offboard
//   { action: "passwords_done" }  the founder reset their TikTok + Instagram passwords and removed phone / two-factor
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "passwords_done") {
      await markPasswordsReset(id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "action must be passwords_done" }, { status: 400 });
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("offboard action failed:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
