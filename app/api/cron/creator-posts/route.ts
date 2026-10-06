// Cron (every 3 hours, see vercel.json): pull every working creator's recent
// TikToks + Instagram Reels from ScrapeCreators, store views, auto-fill
// posting days and auto-approve view bonuses. See lib/creators/post-sync.ts.
//
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
// GET ?creator=<id> limits the run to one creator (manual debugging).

import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { syncAllCreatorPosts } from "@/lib/creators/post-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SCRAPECREATORS_API_KEY) {
    return NextResponse.json({ error: "SCRAPECREATORS_API_KEY not set" }, { status: 500 });
  }
  const only = new URL(req.url).searchParams.get("creator");
  try {
    const r = await syncAllCreatorPosts({ ...(only ? { onlyIds: [only] } : {}) });
    return NextResponse.json({
      ran_at: r.ran_at,
      creators: r.results.length,
      failed: r.results.filter((x) => !x.ok).length,
      credits_remaining: r.credits_remaining,
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
    console.error("creator-posts cron error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
