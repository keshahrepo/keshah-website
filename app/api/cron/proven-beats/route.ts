// Cron, daily (vercel.json): write talking points ("beats") for active proven
// videos that have a transcript but none yet (lib/creators/proven-beats.ts).
// Capped at BEATS_CRON_CAP per run. Videos approved in the admin get theirs
// straight away; this catches failures, new transcripts and anything missed.
// Endings aren't written per video any more: every video uses PINNED_CTA (lib/creators/proven-db.ts).
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { BEATS_CRON_CAP, generateProvenBeats, retitleFormats } from "@/lib/creators/proven-beats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await generateProvenBeats({ limit: BEATS_CRON_CAP, deadlineMs: Date.now() + 200_000 });
    // New videos got names on their own; re-name all formats so no two share one.
    if (r.generated > 0) await retitleFormats().catch((e) => console.error("proven retitle error:", e));
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("proven beats cron error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
