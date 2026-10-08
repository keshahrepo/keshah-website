import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { CreatorDataError } from "@/lib/creators/db";
import { decideTrial, type TrialDecision } from "@/lib/creators/trial";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/creators/:id/trial { decision: "keep" | "end" | "undo" }
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { decision?: string };
  if (!["keep", "end", "undo"].includes(String(body.decision))) return NextResponse.json({ error: "decision must be keep, end or undo" }, { status: 400 });
  try {
    return NextResponse.json(await decideTrial(id, body.decision as TrialDecision));
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("trial decision failed:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
