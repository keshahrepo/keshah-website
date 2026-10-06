import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { listContractEvents, sendContract } from "@/lib/creators/contract";
import { CreatorDataError } from "@/lib/creators/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function fail(e: unknown) {
  if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("admin contract error:", e);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

// GET /api/admin/creators/:id/contract — the append-only contract event log.
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    return NextResponse.json({ events: await listContractEvents(id) });
  } catch (e) {
    return fail(e);
  }
}

// POST /api/admin/creators/:id/contract { action: "send" }
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; version?: string };
  if (body.action !== "send") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  try {
    const version = typeof body.version === "string" && body.version.trim() ? body.version.trim() : undefined;
    return NextResponse.json(await sendContract(id, { version }));
  } catch (e) {
    return fail(e);
  }
}
