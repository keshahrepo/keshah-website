// The offer email exactly as Accept would send it for this plan, without
// sending anything (the founder app shows it before "Send offer").
// POST { plan: "lite" | "full" | "format", custom_base_cents? }
import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { welcomeEmail } from "@/lib/creators/invite";
import { offerPlan } from "@/lib/creators/accept";
import { contractDeadlineFor, deadlineLong } from "@/lib/creators/deadline";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { plan?: string; custom_base_cents?: number };
  const plan = body.plan === "lite" || body.plan === "format" ? body.plan : "full";
  const custom = Number.isInteger(body.custom_base_cents) && Number(body.custom_base_cents) > 0 ? Number(body.custom_base_cents) : undefined;
  const snap = await getFirebaseAdmin().db.collection("careers_applications").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const app = snap.data() ?? {};
  const to = String(app.email ?? "").trim().toLowerCase();
  const mail = welcomeEmail({
    firstName: String(app.full_name ?? "").trim().split(/\s+/)[0] ?? "",
    link: "[their set-password link]",
    signInEmail: to,
    contractReady: true,
    deadlineText: deadlineLong(contractDeadlineFor(new Date())),
    plan: offerPlan({ pay_plan: plan, custom_base_cents: custom }),
  });
  return NextResponse.json({ to, from: mail.fromName, subject: mail.subject, text: mail.text });
}
