// Every 15 min: creators who replied to our outreach email move to "Replied"
// in Recruit (lib/outreach-db.ts), then anyone who replied gets research notes
// on their TikTok (lib/outreach-notes.ts), and due 48-hour follow-ups go out
// (lib/outreach-nudges.ts). GET ?dry=1 reports without writing or sending.
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { sendOutreachNudges, sendQueuedOutreach, syncOutreachReplies } from "@/lib/outreach-db";
import { writeMissingNotes, writeMissingNudgeVideos } from "@/lib/outreach-notes";
import { healthError, healthOk, outreachDailyPushes } from "@/lib/outreach-health";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const start = Date.now();
    // Replies first, so nobody who just replied gets a follow-up.
    const sync = await syncOutreachReplies({ dry });
    const nudges = await sendOutreachNudges({ dry, deadlineMs: start + 130_000 });
    // New creators from the daily search: their first email (weekdays from 11 AM ET).
    let firstEmails: Awaited<ReturnType<typeof sendQueuedOutreach>> | { error: string };
    try {
      firstEmails = await sendQueuedOutreach({ dry, deadlineMs: start + 250_000 });
      if (!dry && !firstEmails.off) await healthOk("send");
    } catch (e) {
      firstEmails = { error: e instanceof Error ? e.message : String(e) };
      if (!dry) await healthError("send", e).catch(() => {});
    }
    // The noon check and the 1 PM summary push (weekdays, ET).
    const pushes = dry ? [] : await outreachDailyPushes().catch(() => []);
    const notes = dry ? null : await writeMissingNotes({ limit: 3, deadlineMs: start + 275_000 });
    // A day in, no reply: pick another of their videos for the follow-up.
    const nudgeVideos = dry ? null : await writeMissingNudgeVideos({ limit: 5, deadlineMs: start + 290_000 });
    return NextResponse.json({ ok: true, ...sync, nudges, firstEmails, pushes, notes, nudgeVideos });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
