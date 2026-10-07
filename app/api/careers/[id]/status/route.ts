// Change an application's status from the admin Recruit tab.
// Allowed transitions: any → accepted | denied. Also lets an admin
// walk one back to "completed" / "booked" if a click was a mis-tap
// (the Recruit tab's Reopen button sends "booked").

import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { notify, PUSH_COPY } from "@/lib/push";

const ALLOWED = new Set(["accepted", "denied", "completed", "booked"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = (await req.json()) as { status?: string };
    const status = (body.status ?? "").trim();
    if (!ALLOWED.has(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const { db } = getFirebaseAdmin();
    const ref = db.collection("careers_applications").doc(id);
    const before = await ref.get();
    const wasAccepted = before.exists && before.get("status") === "accepted";
    await ref
      .set(
        {
          status,
          decided_at:
            status === "accepted" || status === "denied"
              ? FieldValue.serverTimestamp()
              : null,
          last_updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    if (status === "accepted" && !wasAccepted) {
      // KESHAH Creators app push. notify() never throws.
      await notify({ applicationId: id, email: (before.get("email") as string) || null }, PUSH_COPY.accepted);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
