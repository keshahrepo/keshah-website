// Signed PUT URL for a bonus-claim screenshot (same direct-to-GCS pattern as
// /api/careers/upload-url). Objects land under creators/<id>/bonus/.
import { NextRequest, NextResponse } from "next/server";
import { bonusScreenshotUploadUrl } from "@/lib/creators/db";
import { errorResponse, requireCreator } from "../../_auth";

export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const b = await req.json();
    return NextResponse.json(
      await bonusScreenshotUploadUrl(creator.id, {
        filename: b.filename,
        contentType: b.contentType,
        sizeBytes: Number(b.sizeBytes ?? 0),
      }),
    );
  } catch (e) {
    return errorResponse(e, "bonus upload-url");
  }
}
