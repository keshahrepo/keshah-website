// Every 15 min: creators who replied to our outreach email move to "Replied"
// in Recruit (lib/outreach-db.ts), then anyone who replied gets research notes
// on their TikTok (lib/outreach-notes.ts). GET ?dry=1 reports without writing.
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { syncOutreachReplies } from "@/lib/outreach-db";
import { writeMissingNotes } from "@/lib/outreach-notes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const start = Date.now();
    const sync = await syncOutreachReplies({ dry });
    const notes = dry ? null : await writeMissingNotes({ limit: 3, deadlineMs: start + 80_000 });
    return NextResponse.json({ ok: true, ...sync, notes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
