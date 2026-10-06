import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { CreatorDataError } from "@/lib/creators/db";
import { listRevealLog, setPayeeSetUp } from "@/lib/creators/payments";
import { encryptionConfigured } from "@/lib/creators/secure";
import { adminActor } from "../../_actor";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

function fail(e: unknown) {
  if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("admin payment error:", e);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

// GET: who has revealed / downloaded this creator's payment data (summary lives on the creator doc).
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    return NextResponse.json({ enabled: encryptionConfigured(), reveal_log: await listRevealLog(id) });
  } catch (e) {
    return fail(e);
  }
}

// PATCH { payee_set_up: boolean }: "Mark payee set up in Amex".
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as { payee_set_up?: unknown };
    if (typeof body.payee_set_up !== "boolean") return NextResponse.json({ error: "payee_set_up must be true or false" }, { status: 400 });
    return NextResponse.json({ payment_details: await setPayeeSetUp(id, body.payee_set_up, await adminActor(req)) });
  } catch (e) {
    return fail(e);
  }
}
