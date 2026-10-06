import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, signedReadUrl } from "@/lib/creators/admin";
import {
  CONSENT_TEXT_VERSION,
  PLACEHOLDER_TEMPLATE,
  SIGNATURE_FONT,
  SIGNATURE_FONT_CSS_URL,
  contractSettingsReady,
  founderSignatureMode,
  getContractSettings,
  listTemplates,
  saveContractSettings,
} from "@/lib/creators/contract";
import { CreatorDataError, getPortalSettings, savePortalSettings } from "@/lib/creators/db";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("admin creator settings error:", e);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

// GET /api/admin/creators/settings — contract signing + portal settings.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const [contract, templates, portal] = await Promise.all([getContractSettings(), listTemplates(), getPortalSettings()]);
    return NextResponse.json({
      contract,
      ready: contractSettingsReady(contract) && !!contract.current_template_version,
      signature_url: contract.signature_path ? await signedReadUrl(contract.signature_path, 15) : null,
      signature_mode: founderSignatureMode(contract),
      signature_font: { family: SIGNATURE_FONT, css_url: SIGNATURE_FONT_CSS_URL },
      templates,
      placeholder: PLACEHOLDER_TEMPLATE,
      consent_text_version: CONSENT_TEXT_VERSION,
      portal: {
        slack_invite_url: portal.slack_invite_url_stored,
        env_fallback: !portal.slack_invite_url_stored && !!process.env.SLACK_INVITE_URL,
      },
    });
  } catch (e) {
    return fail(e);
  }
}

// PUT { founder_name?, founder_title?, entity_name?, slack_invite_url? }
export async function PUT(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const patch: Record<string, string> = {};
    for (const k of ["founder_name", "founder_title", "entity_name"] as const) if (b[k] !== undefined) patch[k] = String(b[k]);
    if (Object.keys(patch).length) await saveContractSettings(patch);
    if (b.slack_invite_url !== undefined) await savePortalSettings({ slack_invite_url: String(b.slack_invite_url ?? "") });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
