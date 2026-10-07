import { NextRequest, NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { CreatorDataError } from "@/lib/creators/db";
import { updateProven, type ProvenAction } from "@/lib/creators/proven-db";
import { mirrorProvenCovers, needsCover } from "@/lib/creators/proven-media";

export const dynamic = "force-dynamic";

const ACTIONS = new Set<ProvenAction>(["approve", "dismiss", "pause", "retire", "restore", "keep", "edit_hook", "set_audience", "edit_idea"]);

// PATCH { action, hook_line?, audience?, talking_points?, reference_url? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!ACTIONS.has(b.action as ProvenAction)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  try {
    const video = await updateProven(id, b.action as ProvenAction, {
      hook_line: typeof b.hook_line === "string" ? b.hook_line : undefined,
      audience: typeof b.audience === "string" ? b.audience : undefined,
      talking_points: b.talking_points,
      reference_url: typeof b.reference_url === "string" ? b.reference_url : undefined,
    });
    // Approved / restored: copy its cover to our storage after responding (cron retries failures).
    if (needsCover(video)) {
      after(() => mirrorProvenCovers({ ids: [id], limit: 1 }).catch((e) => console.error("proven cover mirror error:", e)));
    }
    return NextResponse.json({ video });
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("admin proven patch error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
