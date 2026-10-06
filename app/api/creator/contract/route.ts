import { NextRequest, NextResponse } from "next/server";
import {
  CONSENT_CHECKBOX_LABEL,
  CONSENT_DISCLOSURE,
  CONSENT_TEXT_VERSION,
  SIGNATURE_FONT,
  SIGNATURE_FONT_CSS_URL,
  getSigningInfo,
} from "@/lib/creators/contract";
import { signedReadUrl } from "@/lib/creators/db";
import { errorResponse, requireCreator } from "../_auth";

export const dynamic = "force-dynamic";

// GET: contract status + what the signing form needs.
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const info = await getSigningInfo(creator.id);
    return NextResponse.json({
      status: info.status,
      signed_at: info.signed_at,
      signed_sha256: info.signed_sha256,
      document_id: info.document_id,
      emailed_copy: info.emailed_copy,
      template: info.template,
      // Signed copy: short-lived link. Unsigned: streamed through our API (never a public URL).
      download_url: info.pdf_path ? await signedReadUrl(info.pdf_path, 15) : null,
      document_url: info.status === "sent" ? "/api/creator/contract/document" : null,
      legal_name_on_file: info.legal_name_on_file,
      email: creator.email,
      timezone: creator.timezone,
      consent: { version: CONSENT_TEXT_VERSION, label: CONSENT_CHECKBOX_LABEL, disclosure: CONSENT_DISCLOSURE },
      signature_font: { family: SIGNATURE_FONT, css_url: SIGNATURE_FONT_CSS_URL },
    });
  } catch (e) {
    return errorResponse(e, "contract");
  }
}
