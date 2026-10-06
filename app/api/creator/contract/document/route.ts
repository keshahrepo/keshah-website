import { NextRequest, NextResponse } from "next/server";
import { getSigningInfo, recordContractViewed, templateBytes } from "@/lib/creators/contract";
import { CreatorDataError, signedReadUrl } from "@/lib/creators/db";
import { errorResponse, requestMeta, requireCreator } from "../../_auth";

export const dynamic = "force-dynamic";

// GET: the contract PDF for the signed-in creator. Unsigned -> the template
// they were sent (first open is logged for the audit trail). Signed -> a
// short-lived link to their signed copy.
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const info = await getSigningInfo(creator.id);
    if (info.status === "signed" && info.pdf_path) return NextResponse.redirect(await signedReadUrl(info.pdf_path, 15));
    if (info.status !== "sent" || !info.template) throw new CreatorDataError("Your contract is being prepared.", 404);
    const { bytes } = await templateBytes(info.template.version);
    await recordContractViewed(creator.id, requestMeta(req)).catch((e) => console.error("contract view log failed:", e));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="KESHAH-contract-${info.template.version}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e, "contract document");
  }
}
