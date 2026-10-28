// Every 15 min: creators who replied to our outreach email move to "Replied"
// in Recruit (lib/outreach-db.ts), then anyone who replied gets research notes
// on their TikTok (lib/outreach-notes.ts), and due 48-hour follow-ups go out
// (lib/outreach-nudges.ts). GET ?dry=1 reports without writing or sending.
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { sendOutreachNudges, syncOutreachReplies } from "@/lib/outreach-db";
import { writeMissingNotes } from "@/lib/outreach-notes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const start = Date.now();
    // Replies first, so nobody who just replied gets a follow-up.
    const sync = await syncOutreachReplies({ dry });
    const nudges = await sendOutreachNudges({ dry, deadlineMs: start + 60_000 });
    const notes = dry ? null : await writeMissingNotes({ limit: 3, deadlineMs: start + 85_000 });
    return NextResponse.json({ ok: true, ...sync, nudges, notes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
