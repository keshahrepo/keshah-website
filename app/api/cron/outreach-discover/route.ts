// Every 30 min: the daily creator search keeps outreach_queue topped up
// (lib/outreach-discover.ts). Does nothing while the queue is full.
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { discoverStep } from "@/lib/outreach-discover";
import { healthError, healthOk } from "@/lib/outreach-health";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await discoverStep({ deadlineMs: Date.now() + 270_000 });
    await healthOk("search");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    await healthError("search", e).catch(() => {});
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
