import { NextRequest, NextResponse } from "next/server";
import { signContract } from "@/lib/creators/contract";
import { errorResponse, requestMeta, requireCreator } from "../../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { consent: true, consent_text_version, typed_name, address }
// The signer is ALWAYS the session creator; nothing in the body picks who signs.
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const r = await signContract(
      creator.id,
      {
        consent: b.consent === true,
        consent_text_version: String(b.consent_text_version ?? ""),
        typed_name: String(b.typed_name ?? ""),
        address: String(b.address ?? ""),
      },
      requestMeta(req),
    );
    return NextResponse.json({ ok: true, signed_at: r.signed_at, document_id: r.document_id, signed_sha256: r.signed_sha256, emailed: r.emailed.creator });
  } catch (e) {
    return errorResponse(e, "contract sign");
  }
}
