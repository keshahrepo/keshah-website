import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { setCurrentTemplate, uploadTemplate } from "@/lib/creators/contract";
import { CreatorDataError } from "@/lib/creators/db";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("contract template error:", e);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

// POST { version, title?, pdf_base64 } — upload a new contract version (becomes current).
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { version?: string; title?: string; pdf_base64?: string };
  const b64 = String(b.pdf_base64 ?? "").replace(/^data:application\/pdf;base64,/, "");
  if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return NextResponse.json({ error: "Attach a PDF" }, { status: 400 });
  try {
    const template = await uploadTemplate({ version: String(b.version ?? ""), title: b.title, pdf: Buffer.from(b64, "base64") });
    return NextResponse.json({ template });
  } catch (e) {
    return fail(e);
  }
}

// PATCH { current_template_version } — choose which uploaded version Send contract uses.
export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { current_template_version?: string };
  try {
    await setCurrentTemplate(String(b.current_template_version ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
