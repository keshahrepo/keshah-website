// Cron, SHALLOW post sync every 6 hours (vercel.json, SHALLOW_CRON): page 1 of
// every working creator's TikToks + Reels. Day detection + fresh views on the
// newest posts. See lib/creators/post-sync.ts.
import { handlePostSyncCron } from "@/lib/creators/post-sync-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  return handlePostSyncCron(req, "shallow");
}
