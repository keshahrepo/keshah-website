import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { CreatorDataError } from "@/lib/creators/db";
import { extendOffer, withdrawOffer, withdrawPreview } from "@/lib/creators/offer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

function fail(e: unknown, what: string) {
  if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`offer ${what} failed:`, e);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

// GET /api/admin/creators/:id/offer -> the exact "Withdraw offer" email { to, subject, text, group }
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    return NextResponse.json(await withdrawPreview(id));
  } catch (e) {
    return fail(e, "preview");
  }
}

// POST /api/admin/creators/:id/offer
//   { action: "extend" }    contract_deadline_at +48h, reminder reset, nothing sent
//   { action: "withdraw" }  status ended + withdrawn_at, short email, removed from their @keshah.com group
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "extend") return NextResponse.json(await extendOffer(id));
    if (body.action === "withdraw") return NextResponse.json(await withdrawOffer(id));
    return NextResponse.json({ error: "action must be extend or withdraw" }, { status: 400 });
  } catch (e) {
    return fail(e, String(body.action));
  }
}
