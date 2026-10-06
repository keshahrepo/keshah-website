import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, signedReadUrl } from "@/lib/creators/admin";

export const dynamic = "force-dynamic";

// GET /api/admin/creators/file-url?path=creators/... — redirects to a
// short-lived signed read URL (contracts, payment proofs, bonus screenshots).
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path || path.includes("..") || path.startsWith("/")) {
    return NextResponse.json({ error: "Bad path" }, { status: 400 });
  }
  // Tax forms are encrypted and go through the logged download route instead.
  if (/\/tax\//.test(path)) {
    return NextResponse.json({ error: "Use Download tax form on the creator's page." }, { status: 400 });
  }
  const url = await signedReadUrl(path);
  return NextResponse.redirect(url);
}
