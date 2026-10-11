// Change an application's status from the admin Recruit tab.
// Allowed transitions: any → accepted | denied. Also lets an admin
// walk one back to "completed" / "booked" if a click was a mis-tap
// (the Recruit tab's Reopen button sends "booked").
//
// Deny: applicants who sent their video test get one short "not moving
// forward" email from McKenzie (claimed via denial_email_sent_at, so never
// twice, even after a Reopen and a second Deny). No-shows get nothing.

import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { notify, PUSH_COPY } from "@/lib/push";
import { CreatorExistsError, createCreatorRecord, onCreatorAccepted } from "@/lib/creators/admin";
import { claimOnce, releaseClaim } from "@/lib/interview";
import { emailConfigured, sendEmail } from "@/lib/email";
import { CREATOR_FROM_NAME, DENIAL_EMAIL_FIELD, denialEmail, denialEmailDue } from "@/lib/interview-decisions";
import { DEFAULT_TIMEZONE } from "@/lib/creators/db";
import { isValidTimezone } from "@/lib/creators/time";

export const maxDuration = 60;

/** Creates (or finds) the creator for an accepted application and runs Accept. Never throws. */
async function creatorFromApplication(appId: string, a: Record<string, unknown>, req: Request) {
  const email = String(a.email ?? "").trim().toLowerCase();
  const name = String(a.full_name ?? "").trim();
  if (!email || !name) return { id: "", error: "The application has no name or email, so no creator was made." };
  // Applications don't ask for a zone: use the one Calendly saw when they
  // booked the interview. Else the default, which the app replaces with the
  // phone's zone on first sign-in (lib/mobile/app-seen.ts). Editable on the creator's page.
  const tzOf = (v: unknown) => (typeof v === "string" && v.trim() && isValidTimezone(v.trim()) ? v.trim() : "");
  const known = tzOf(a.timezone) || tzOf(a.calendly_invitee_timezone);
  let id: string;
  try {
    id = await createCreatorRecord({
      legal_name: name,
      email,
      timezone: known || DEFAULT_TIMEZONE,
      ...(known ? { timezone_source: "calendly" as const } : {}),
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

/** The denial email for someone who interviewed. Never throws; says what happened. */
async function sendDenialEmail(db: FirebaseFirestore.Firestore, ref: FirebaseFirestore.DocumentReference): Promise<string> {
  try {
    let app: Record<string, unknown> = {};
    const won = await claimOnce(db, ref, (cur) => {
      if (!denialEmailDue(cur)) return null;
      app = cur;
      return { [DENIAL_EMAIL_FIELD]: FieldValue.serverTimestamp() };
    });
    if (!won) return "not sent (no video, or already sent)";
    if (!emailConfigured()) {
      await releaseClaim(ref, DENIAL_EMAIL_FIELD).catch(() => {});
      return "not sent (email isn't set up)";
    }
    const first = String(app.full_name ?? "").trim().split(/\s+/)[0] || "there";
    try {
      await sendEmail({ to: String(app.email).trim(), fromName: CREATOR_FROM_NAME, ...denialEmail(first) });
    } catch (e) {
      await releaseClaim(ref, DENIAL_EMAIL_FIELD).catch(() => {});
      return `failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    return "sent";
  } catch (e) {
    return `failed: ${e instanceof Error ? e.message : String(e)}`;
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
    if (!before.exists) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }
    const wasAccepted = before.get("status") === "accepted";
    const wasDenied = before.get("status") === "denied";
    await ref
      .set(
        {
          status,
          decided_at:
            status === "accepted" || status === "denied"
              ? FieldValue.serverTimestamp()
              : null,
          // A founder decision replaces an automatic one (and Reopen clears it).
          ...(status === "denied" ? { denied_reason: "founder" } : { denied_reason: FieldValue.delete() }),
          auto_denied_at: FieldValue.delete(),
          last_updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    let denialEmailResult: string | null = null;
    if (status === "denied" && !wasDenied) denialEmailResult = await sendDenialEmail(db, ref);
    let creator: { id: string; accept?: unknown; error?: string } | null = null;
    if (status === "accepted" && !wasAccepted) {
      // One tap: the application becomes a creator, then the Accept steps run
      // (keshah.com inbox, welcome email with the app link, v2 contract).
      creator = await creatorFromApplication(id, before.data() ?? {}, req);
      // KESHAH Creators app push. notify() never throws.
      await notify({ applicationId: id, email: (before.get("email") as string) || null }, PUSH_COPY.accepted);
    }
    return NextResponse.json({
      ok: true,
      ...(creator ? { creator } : {}),
      ...(denialEmailResult ? { denial_email: denialEmailResult } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
