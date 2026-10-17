import { NextRequest, NextResponse } from "next/server";
import { businessImageFor, getBusinessVerification } from "@/lib/creators/business-verification";
import { errorResponse, requireCreator, requireNotEnded } from "../_auth";

export const dynamic = "force-dynamic";

// GET: the address to type in TikTok's business verification.
// GET ?image=1: the image to upload there (logged per creator).
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  const ended = requireNotEnded(creator, "Your contract has ended, so this isn't available any more.");
  if (ended) return ended;
  try {
    const headers = { "Cache-Control": "private, no-store" };
    if (new URL(req.url).searchParams.get("image") === "1") {
      return NextResponse.json({ image_b64: await businessImageFor(creator.id) }, { headers });
    }
    const v = await getBusinessVerification();
    return NextResponse.json({ address_line: v.address_line, city: v.city, state: v.state, zip: v.zip, county: v.county, has_image: v.has_image }, { headers });
  } catch (e) {
    return errorResponse(e, "business verification");
  }
}
