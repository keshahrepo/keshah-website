import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { HookInputError, addHook, listHooks, setHookStatus } from "@/lib/founder/hooks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET  /api/founder/hooks -> { hooks }: the core script's hooks (founder app Content tab).
// POST { action: "add", text, reference_url? } | { action: "promote" | "retire" | "restore", id } -> { hooks }
export async function GET() {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ hooks: await listHooks() });
  } catch (e) {
    console.error("founder hooks failed:", e);
    return NextResponse.json({ error: "Couldn't load hooks." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action;
    if (action === "add") await addHook({ text: body.text, reference_url: body.reference_url });
    else if (action === "promote" || action === "retire" || action === "restore") await setHookStatus(String(body.id ?? ""), action);
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    return NextResponse.json({ hooks: await listHooks() });
  } catch (e) {
    if (e instanceof HookInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("founder hooks action failed:", e);
    return NextResponse.json({ error: "That didn't go through. Try again." }, { status: 500 });
  }
}
