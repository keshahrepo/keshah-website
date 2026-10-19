// Cron, every 10 minutes (vercel.json): The Scalp Report's daily drafts (lib/creators/faceless.ts).
// Drafts today's batch after 10:00 UTC (3 AM PDT / 2 AM PST), a chunk per call until complete, or now when
// Settings/creator_portal.faceless_draft_requested is true. Idle: one Firestore read.
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireCronSecret } from "@/lib/support/auth";
import { draftFacelessDay, FACELESS_DEFAULT_PER_DAY } from "@/lib/creators/faceless";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { db } = getFirebaseAdmin();
    const ref = db.collection("Settings").doc("creator_portal");
    const s = (await ref.get()).data() ?? {};
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const requested = s.faceless_draft_requested === true;
    const due = s.faceless_enabled !== false && now.getUTCHours() >= 10 && s.faceless_last_draft !== date;
    if (!requested && !due) return NextResponse.json({ ok: true, skipped: true });
    if (requested) await ref.set({ faceless_draft_requested: false }, { merge: true });
    const perDay = typeof s.faceless_per_day === "number" ? s.faceless_per_day : FACELESS_DEFAULT_PER_DAY;
    // A chunk per call (the next 10-minute call carries on) until the day's batch is complete.
    const r = await draftFacelessDay(db, { date, perDay, now, deadlineMs: Date.now() + 230_000 });
    if (r.complete) await ref.set({ faceless_last_draft: date }, { merge: true });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("faceless draft cron error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
