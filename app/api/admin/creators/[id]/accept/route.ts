import { NextRequest, NextResponse } from "next/server";
import { onCreatorAccepted, requireAdmin } from "@/lib/creators/admin";
import { ACCEPT_STEPS, markInviteSentManually } from "@/lib/creators/accept";
import type { AcceptStepKey } from "@/lib/creators/types";
import { CreatorDataError } from "@/lib/creators/db";
import { isKeshahAddress } from "@/lib/creators/google-groups";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/creators/:id/accept
//   {}                               run / retry every step that isn't done
//   { keshah_email: "x@keshah.com" } same, with an admin-chosen inbox address
//   { resend_invite: true }          also make + send a fresh set-password link
//   { action: "mark_invite_sent" }   founder sent the link by hand
//   { step: "group" | "invite" | "contract" }  "Retry" one failed step only (forced)
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { keshah_email?: string; resend_invite?: boolean; action?: string; step?: string };
  try {
    if (body.action === "mark_invite_sent") return NextResponse.json({ accept: await markInviteSentManually(id) });
    if (body.action !== undefined) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const keshahEmail = String(body.keshah_email ?? "").trim().toLowerCase();
    if (keshahEmail && !isKeshahAddress(keshahEmail)) {
      return NextResponse.json({ error: "The inbox address must be a plain name@keshah.com address" }, { status: 400 });
    }
    if (body.step !== undefined && !(ACCEPT_STEPS as string[]).includes(body.step)) {
      return NextResponse.json({ error: "step must be group, invite or contract" }, { status: 400 });
    }
    const step = body.step as AcceptStepKey | undefined;
    const res = await onCreatorAccepted(id, {
      ...(step ? { only: [step], force: [step] } : {}),
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin,
      ...(keshahEmail ? { keshahEmail } : {}),
      ...(body.resend_invite && !step ? { force: ["invite" as const] } : {}),
    });
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("admin accept error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
