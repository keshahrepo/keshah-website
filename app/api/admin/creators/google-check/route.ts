import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { checkGoogleConnection } from "@/lib/creators/google-groups";

export const dynamic = "force-dynamic";

// GET /api/admin/creators/google-check: READ-ONLY Google Workspace test
// (parse key, delegated token, list up to 5 groups). Never returns key
// material or the full admin email.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await checkGoogleConnection());
  } catch (e) {
    console.error("google-check error:", e);
    return NextResponse.json({ ok: false, stage: "list", message: "Unexpected error while checking (see server logs)." });
  }
}
