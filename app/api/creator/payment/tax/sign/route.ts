import { NextRequest, NextResponse } from "next/server";
import { getCreatorPaymentView, signTaxForm, type TaxFormType } from "@/lib/creators/payments";
import { errorResponse, requestMeta, requireCreator } from "../../../_auth";

export const dynamic = "force-dynamic";

// POST { form, fields, typed_name, certify, cert_version }: e-sign the W-9 / W-8BEN.
// The signer id comes from the session token, never the body.
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    await signTaxForm(
      creator.id,
      {
        form: body.form as TaxFormType, // validated in signTaxForm
        fields: (body.fields as Record<string, unknown>) ?? {},
        typed_name: String(body.typed_name ?? ""),
        certify: body.certify === true,
        cert_version: String(body.cert_version ?? ""),
      },
      requestMeta(req),
    );
    return NextResponse.json(await getCreatorPaymentView(creator.id));
  } catch (e) {
    return errorResponse(e, "tax sign");
  }
}
