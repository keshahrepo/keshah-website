import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { founderHome } from "@/lib/founder/home";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/founder/home: the founder app's Today tab (needs + headline numbers).
export async function GET() {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await founderHome());
  } catch (e) {
    console.error("founder home failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
