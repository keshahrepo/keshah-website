// Change an application's status from the admin Recruit tab.
// Allowed transitions: any → accepted | denied. Also lets an admin
// walk one back to "completed" if a click was a mis-tap.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const ALLOWED = new Set(["accepted", "denied", "completed"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { status?: string };
    const status = (body.status ?? "").trim();
    if (!ALLOWED.has(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const { db } = getFirebaseAdmin();
    await db
      .collection("careers_applications")
      .doc(id)
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
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
