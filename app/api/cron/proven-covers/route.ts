// Cron, daily (vercel.json): copy the cover image of active proven videos that
// still lack one into Firebase Storage (lib/creators/proven-media.ts). Capped
// at MEDIA_CRON_CAP per run (at most 1 ScrapeCreators credit each; most are
// free via the stored URL or TikTok oEmbed). Videos approved in the admin get
// their cover straight away; this catches failures and anything missed.
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { MEDIA_CRON_CAP, mirrorProvenCovers } from "@/lib/creators/proven-media";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await mirrorProvenCovers({ limit: MEDIA_CRON_CAP, deadlineMs: Date.now() + 240_000 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("proven covers cron error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
