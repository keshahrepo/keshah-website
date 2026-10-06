import { NextRequest, NextResponse } from "next/server";
import { buildZip, requireAdmin } from "@/lib/creators/admin";
import { CreatorDataError } from "@/lib/creators/db";
import { allTaxFormPdfs } from "@/lib/creators/payments";
import { adminActor } from "../../_actor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Vercel caps function responses at 4.5 MB; stay under it.
const MAX_ZIP_BYTES = 4_300_000;

// GET: admin-only "Tax forms" ZIP for the accountant (every submitted W-9 / W-8BEN,
// decrypted). Streamed straight back, never written to Storage. Logged per creator.
// Bank details are never included.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const files = await allTaxFormPdfs(await adminActor(req));
    if (!files.length) return NextResponse.json({ error: "No tax forms on file yet." }, { status: 404 });
    const zip = buildZip(files);
    if (zip.length > MAX_ZIP_BYTES) {
      return NextResponse.json({ error: "Too many forms for one download. Download them one at a time from each creator's page." }, { status: 413 });
    }
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="keshah-creator-tax-forms-${new Date().toISOString().slice(0, 10)}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("tax forms zip error:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
