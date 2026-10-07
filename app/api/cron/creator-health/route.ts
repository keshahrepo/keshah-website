// Cron, daily (vercel.json): the creator system health check (lib/creators/health.ts).
// Emails the founder only when something needs a look. GET ?dry=1 lists problems without emailing.
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { runCreatorHealth } from "@/lib/creators/health";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const dry = new URL(req.url).searchParams.get("dry") === "1";
    return NextResponse.json({ ok: true, ...(await runCreatorHealth({ dry })) });
  } catch (e) {
    console.error("creator health cron error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
