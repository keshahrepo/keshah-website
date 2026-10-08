// Change an application's status from the admin Recruit tab.
// Allowed transitions: any → accepted | denied. Also lets an admin
// walk one back to "completed" / "booked" if a click was a mis-tap
// (the Recruit tab's Reopen button sends "booked").

import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { notify, PUSH_COPY } from "@/lib/push";
import { CreatorExistsError, createCreatorRecord, onCreatorAccepted } from "@/lib/creators/admin";

export const maxDuration = 60;

/** Creates (or finds) the creator for an accepted application and runs Accept. Never throws. */
async function creatorFromApplication(appId: string, a: Record<string, unknown>, req: Request) {
  const email = String(a.email ?? "").trim().toLowerCase();
  const name = String(a.full_name ?? "").trim();
  if (!email || !name) return { id: "", error: "The application has no name or email, so no creator was made." };
  let id: string;
  try {
    id = await createCreatorRecord({
      legal_name: name,
      email,
      // Applications don't ask for one; editable on the creator's page.
      timezone: typeof a.timezone === "string" && a.timezone ? a.timezone : "America/New_York",
      application_id: appId,
    });
  } catch (e) {
    if (!(e instanceof CreatorExistsError)) return { id: "", error: e instanceof Error ? e.message : String(e) };
    id = e.creatorId;
  }
  try {
    const res = await onCreatorAccepted(id, { siteUrl: process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin });
    return { id, accept: res.accept };
  } catch (e) {
    return { id, error: e instanceof Error ? e.message : String(e) };
  }
}

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
    let creator: { id: string; accept?: unknown; error?: string } | null = null;
    if (status === "accepted" && !wasAccepted) {
      // One tap: the application becomes a creator, then the Accept steps run
      // (keshah.com inbox, welcome email with the app link, v2 contract).
      creator = await creatorFromApplication(id, before.data() ?? {}, req);
      // KESHAH Creators app push. notify() never throws.
      await notify({ applicationId: id, email: (before.get("email") as string) || null }, PUSH_COPY.accepted);
    }
    return NextResponse.json({ ok: true, ...(creator ? { creator } : {}) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
