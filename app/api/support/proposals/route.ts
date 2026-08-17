import { NextResponse } from "next/server";
import { listProposals, setProposalStatus } from "@/lib/support/proposals";
import { getActivePrompts, updatePrompts } from "@/lib/support/prompts";
import { requireDashboardSession } from "@/lib/support/auth";

export const maxDuration = 30;

export async function GET() {
  const session = await requireDashboardSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const pending = await listProposals("pending");
  return NextResponse.json({ proposals: pending });
}

// POST body: { id: string, action: "approve" | "reject" }
// On approve: update the corresponding prompt field in support_config/active
// and mark the proposal as approved.
export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: string; action?: "approve" | "reject" } | null;
  const id = body?.id?.trim();
  const action = body?.action;
  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "id and action ('approve'|'reject') required" }, { status: 400 });
  }

  if (action === "reject") {
    const result = await setProposalStatus(id, "rejected");
    if (!result) return NextResponse.json({ error: "proposal not found" }, { status: 404 });
    return NextResponse.json({ ok: true, proposal: result });
  }

  // Approve: apply the patch to the active prompts, THEN mark approved.
  const pending = await listProposals("pending");
  const target = pending.find((p) => p.id === id);
  if (!target) return NextResponse.json({ error: "proposal not found or not pending" }, { status: 404 });

  const current = await getActivePrompts();
  const fieldMap = {
    voiceRules: current.voiceRules,
    canonicalAnswers: current.canonicalAnswers,
    categoryRules: current.categoryRules,
  } as const;
  const currentText = fieldMap[target.target];
  const nextText = target.patchType === "replace"
    ? target.proposedText
    : `${currentText}\n\n${target.proposedText.trim()}`;

  const updated = await updatePrompts({ [target.target]: nextText });
  const resolved = await setProposalStatus(id, "approved");

  return NextResponse.json({ ok: true, proposal: resolved, prompts_version: updated.version });
}
