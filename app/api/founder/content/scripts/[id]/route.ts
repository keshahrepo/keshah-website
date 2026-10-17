import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { approveScript, editScript } from "@/lib/creators/content-db";
import { rejectScript, voiceEdit } from "@/lib/creators/content-writer";
import { contentError, jsonBody } from "../../_shared";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/founder/content/scripts/{id}: approve | reject {reason?} | edit {fields} | voice {note} (see CONTRACT).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await jsonBody(req);
  try {
    switch (body.action) {
      case "approve":
        return NextResponse.json({ script: await approveScript(id) });
      case "reject":
        return NextResponse.json(await rejectScript(id, typeof body.reason === "string" ? body.reason : ""));
      case "edit": {
        const fields = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? (body.fields as Record<string, unknown>) : null;
        if (!fields) return NextResponse.json({ error: "fields must be an object." }, { status: 400 });
        return NextResponse.json({ script: await editScript(id, fields) });
      }
      case "voice":
        return NextResponse.json(await voiceEdit(id, typeof body.note === "string" ? body.note : ""));
      default:
        return NextResponse.json({ error: "action must be approve, reject, edit or voice." }, { status: 400 });
    }
  } catch (e) {
    return contentError(e, "founder content script");
  }
}
