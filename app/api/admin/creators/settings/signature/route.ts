import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { saveFounderSignature } from "@/lib/creators/contract";
import { CreatorDataError } from "@/lib/creators/db";

export const dynamic = "force-dynamic";

// POST { data_url: "data:image/png;base64,..." } — drawn on a canvas or an uploaded PNG.
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { data_url?: string };
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data_url ?? ""));
  if (!m) return NextResponse.json({ error: "Send a PNG image" }, { status: 400 });
  try {
    const settings = await saveFounderSignature(Buffer.from(m[1], "base64"));
    return NextResponse.json({ ok: true, signature_sha256: settings.signature_sha256 });
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("signature upload error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
