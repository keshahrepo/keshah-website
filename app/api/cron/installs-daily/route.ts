// Cron, hourly (vercel.json): installs by day (Aadi / creators / organic) and views, for the founder chart.
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { refreshInstallsDaily } from "@/lib/founder/installs-daily";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await refreshInstallsDaily()) });
  } catch (e) {
    console.error("installs daily cron error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
