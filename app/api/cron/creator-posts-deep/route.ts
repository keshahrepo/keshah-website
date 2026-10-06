// Cron, DEEP post sync once a day (vercel.json, DEEP_CRON): pages back through
// the last 32 days (max 20 pages per platform) so views and 100K/1M bonus
// crossings stay current across the whole 30-day window. See lib/creators/post-sync.ts.
import { handlePostSyncCron } from "@/lib/creators/post-sync-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  return handlePostSyncCron(req, "deep");
}
