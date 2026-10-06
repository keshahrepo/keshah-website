// Shared handler for the two post-sync crons (see vercel.json):
//   /api/cron/creator-posts       shallow, every 6h  (SHALLOW_CRON)
//   /api/cron/creator-posts-deep  deep, once a day   (DEEP_CRON)
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
// ?creator=<id> limits a run to one creator (manual debugging).
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { syncAllCreatorPosts, type SyncMode } from "./post-sync";

export async function handlePostSyncCron(req: Request, mode: SyncMode): Promise<NextResponse> {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SCRAPECREATORS_API_KEY) {
    return NextResponse.json({ error: "SCRAPECREATORS_API_KEY not set" }, { status: 500 });
  }
  const only = new URL(req.url).searchParams.get("creator");
  try {
    const r = await syncAllCreatorPosts({ mode, ...(only ? { onlyIds: [only] } : {}) });
    return NextResponse.json({
      mode,
      ran_at: r.ran_at,
      creators: r.results.length,
      failed: r.results.filter((x) => !x.ok).length,
      credits_remaining: r.credits_remaining,
      estimate: r.estimate,
      alert_sent: r.alert_sent,
      results: r.results.map((x) => ({
        creator_id: x.creator_id,
        ok: x.ok,
        skipped: x.skipped,
        platforms: x.platforms,
        posted_days_detected: x.posted_days_detected,
        days_written: x.days_written,
        start_date_set: x.start_date_set,
        claims_created: x.claims_created,
        claims_upgraded: x.claims_upgraded,
      })),
    });
  } catch (e) {
    console.error(`creator-posts ${mode} cron error:`, e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
