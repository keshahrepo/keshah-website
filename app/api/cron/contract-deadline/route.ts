// Cron (every 30 min, see vercel.json): the "Your KESHAH offer is waiting"
// reminder for new creators who haven't signed their agreement. Once per
// deadline (ContentCreators.contract_reminder_sent_at, claimed in a
// transaction), from 6 PM ET the evening before the 11:59 PM ET deadline.
// Skips anyone signed, withdrawn, or no longer onboarding. A missed deadline
// is never acted on here: it shows on the founder's Home instead.
//
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
// GET ?dry=1 reports who would get it without sending or writing.

import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { sendContractReminders } from "@/lib/creators/offer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const res = await sendContractReminders(new Date(), { dry });
    return NextResponse.json({ ok: true, dry, ...res });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
