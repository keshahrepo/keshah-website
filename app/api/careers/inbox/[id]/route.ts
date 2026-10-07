// Admin: one applicant's text thread, oldest first.
// GET -> { messages: [{ id, direction, text, attachments, at, read, kind }] }

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireDashboardSession } from "@/lib/support/auth";
import { listThread } from "@/lib/applicant-inbox-firestore";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const { db } = getFirebaseAdmin();
    const messages = (await listThread(db, id)).map((m) => ({
      id: m.id,
      direction: m.direction,
      text: m.text,
      attachments: m.attachments,
      at: m.at_ms > 0 ? new Date(m.at_ms).toISOString() : null,
      read: m.read,
      kind: m.kind,
    }));
    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
