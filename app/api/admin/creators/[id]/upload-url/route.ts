import { NextRequest, NextResponse } from "next/server";
import { getCreator, requireAdmin, safeFilename, signedUploadUrl } from "@/lib/creators/admin";

export const dynamic = "force-dynamic";

const KINDS: Record<string, { types: RegExp; max: number }> = {
  contract: { types: /^application\/pdf$/, max: 25 * 1024 * 1024 },
  payment_proof: { types: /^(application\/pdf|image\/(png|jpeg|jpg|webp|heic|heif))$/, max: 25 * 1024 * 1024 },
};

// POST /api/admin/creators/:id/upload-url { kind, filename, contentType, sizeBytes, invoice? }
// Returns a short-lived v4 signed PUT URL; the browser uploads directly to
// storage and then saves the returned objectPath on the creator / invoice.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    kind?: string;
    filename?: string;
    contentType?: string;
    sizeBytes?: number;
    invoice?: string;
  };
  const kind = KINDS[body.kind ?? ""];
  if (!kind) return NextResponse.json({ error: "Unknown upload kind" }, { status: 400 });
  const contentType = body.contentType ?? "";
  if (!kind.types.test(contentType)) {
    return NextResponse.json({ error: body.kind === "contract" ? "Contract must be a PDF" : "Proof must be a PDF or image" }, { status: 400 });
  }
  if ((body.sizeBytes ?? 0) > kind.max) return NextResponse.json({ error: "File too large (25MB max)" }, { status: 400 });
  if (!(await getCreator(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stamp = Date.now().toString(36);
  const name = safeFilename(body.filename ?? "file");
  const objectPath =
    body.kind === "contract"
      ? `creators/${id}/contract/${stamp}_${name}`
      : `creators/${id}/payment_proof/${safeFilename(body.invoice ?? "invoice")}/${stamp}_${name}`;
  const uploadUrl = await signedUploadUrl(objectPath, contentType);
  return NextResponse.json({ uploadUrl, objectPath });
}
