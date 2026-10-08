import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { revenueOverview } from "@/lib/revenue";

// RevenueCat overview (MRR, active subscribers, active trials, revenue) for the
// web dashboard's Overview cards. Same source as the founder app (lib/revenue.ts).
export async function GET() {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const out = await revenueOverview();
  if (out.error) return NextResponse.json(out, { status: 502 });
  return NextResponse.json(out);
}
