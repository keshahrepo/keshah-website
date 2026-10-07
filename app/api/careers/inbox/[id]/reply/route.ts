// Admin: text an applicant back from the inbox.
// POST { text } -> { ok, result }
// Goes out from our one HiBlue line (McKenzie's) via sendInterviewText, which
// also logs it to applicant_messages as kind "reply".

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireDashboardSession } from "@/lib/support/auth";
import { normalizePhone, sendInterviewText, textWasSent } from "@/lib/sms";

export const dynamic = "force-dynamic";

const MAX_LEN = 1000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const b = (await req.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
    if (text.length > MAX_LEN) return NextResponse.json({ error: `Keep it under ${MAX_LEN} characters.` }, { status: 400 });
    const { db } = getFirebaseAdmin();
    const snap = await db.collection("careers_applications").doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: "Application not found." }, { status: 404 });
    const phone = normalizePhone(snap.get("phone"));
    if (!phone) return NextResponse.json({ error: "This applicant has no valid phone number." }, { status: 400 });
    const result = await sendInterviewText({ to: phone, text, ref: id, kind: "reply" });
    if (!textWasSent(result)) {
      const why = "error" in result ? result.error : "skipped" in result ? result.skipped : "not sent";
      return NextResponse.json({ ok: false, error: `Text not sent: ${why}`, result }, { status: 502 });
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
