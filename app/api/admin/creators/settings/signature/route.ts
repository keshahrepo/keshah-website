import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { adoptFounderSignature, saveFounderSignature, setUseDrawnSignature } from "@/lib/creators/contract";
import { CreatorDataError } from "@/lib/creators/db";

export const dynamic = "force-dynamic";

// POST one of:
//   { action: "adopt" }                         adopt your name, typed in the signature font, as your countersignature
//   { action: "use_drawn" | "use_generated" }   switch between the drawn/uploaded PNG and the generated signature
//   { data_url: "data:image/png;base64,..." }   optional override: drawn on a canvas or an uploaded PNG
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { data_url?: string; action?: string };
  try {
    if (b.action === "adopt") {
      const s = await adoptFounderSignature();
      return NextResponse.json({ ok: true, founder_signature_adopted_at: s.founder_signature_adopted_at });
    }
    if (b.action === "use_drawn" || b.action === "use_generated") {
      await setUseDrawnSignature(b.action === "use_drawn");
      return NextResponse.json({ ok: true });
    }
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data_url ?? ""));
    if (!m) return NextResponse.json({ error: "Send a PNG image" }, { status: 400 });
    const settings = await saveFounderSignature(Buffer.from(m[1], "base64"));
    return NextResponse.json({ ok: true, signature_sha256: settings.signature_sha256 });
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("signature settings error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
