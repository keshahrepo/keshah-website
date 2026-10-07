// Admin: applicant text inbox (Recruit tab).
// GET -> { conversations, unread_total, sync }
// Pulls new replies in first (same sync the every-minute reminders cron runs),
// unless ?sync=0. A sync failure is reported, never fatal.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireDashboardSession } from "@/lib/support/auth";
import { groupConversations } from "@/lib/applicant-inbox";
import { listInboxMessages, runApplicantInboxSync } from "@/lib/applicant-inbox-firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { db } = getFirebaseAdmin();
    let sync: Record<string, unknown> | null = null;
    if (new URL(req.url).searchParams.get("sync") !== "0") {
      try {
        const r = await runApplicantInboxSync(db);
        sync = { created: r.created, errors: r.errors };
      } catch (e) {
        sync = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    const convos = groupConversations(await listInboxMessages(db));
    const refs = convos.map((c) => db.collection("careers_applications").doc(c.application_id));
    const snaps = refs.length ? await db.getAll(...refs, { fieldMask: ["full_name", "status", "phone"] }) : [];
    const byId = new Map(snaps.map((s) => [s.id, s.data() ?? {}]));
    const conversations = convos.map((c) => {
      const a = byId.get(c.application_id) ?? {};
      return {
        application_id: c.application_id,
        name: (a.full_name as string) || null,
        status: (a.status as string) || null,
        phone: (a.phone as string) || null,
        last_text: c.last_text.slice(0, 200),
        last_direction: c.last_direction,
        last_at: c.last_at_ms > 0 ? new Date(c.last_at_ms).toISOString() : null,
        unread: c.unread,
        has_inbound: c.has_inbound,
      };
    });
    const unread_total = conversations.reduce((n, c) => n + c.unread, 0);
    return NextResponse.json({ conversations, unread_total, sync });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
