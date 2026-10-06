import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { CreatorDataError, listCreators } from "@/lib/creators/db";
import { addIdea, findProvenVideos, listProven } from "@/lib/creators/proven-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function fail(e: unknown) {
  if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("admin proven error:", e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
}

// GET: the whole proven list (small collection) + creator names for idea assignments.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const [videos, creators] = await Promise.all([listProven(), listCreators()]);
    return NextResponse.json({
      videos,
      creators: Object.fromEntries(creators.map((c) => [c.id, c.name])),
    });
  } catch (e) {
    return fail(e);
  }
}

// POST { action: "seed", dry_run? } | { action: "add_idea", hook_line, talking_points, reference_url?, idea_text?, audience? }
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const started = Date.now();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (b.action === "seed") {
      const r = await findProvenVideos({ dryRun: b.dry_run === true, deadlineMs: started + 280_000, log: (m) => console.log(m) });
      return NextResponse.json(r);
    }
    if (b.action === "add_idea") {
      const idea = await addIdea({
        hook_line: String(b.hook_line ?? ""),
        talking_points: b.talking_points,
        reference_url: typeof b.reference_url === "string" ? b.reference_url : "",
        idea_text: typeof b.idea_text === "string" ? b.idea_text : "",
        audience: typeof b.audience === "string" ? b.audience : undefined,
      });
      return NextResponse.json({ idea });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}
