import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import {
  firestoreAccountPasswordStore,
  isSocialPlatform,
  revealAccountPassword,
  setAccountPassword,
} from "@/lib/creators/account-passwords";
import { CreatorDataError } from "@/lib/creators/db";
import { adminActor } from "../../../_actor";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; platform: string }> };

const noStore = { "Cache-Control": "private, no-store" };

function fail(e: unknown) {
  if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("account password error:", e);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

// GET: reveal the creator's TikTok / Instagram password. Logged to
// private/payment/reveal_log first (like the bank reveal); no log, no password.
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id, platform } = await params;
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  try {
    const password = await revealAccountPassword(await firestoreAccountPasswordStore(), id, platform, await adminActor(req));
    return NextResponse.json({ platform, password }, { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}

// PUT { password }: save the new password after the founder resets the account. Logged.
export async function PUT(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id, platform } = await params;
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  try {
    const body = (await req.json().catch(() => ({}))) as { password?: unknown };
    const saved = await setAccountPassword(await firestoreAccountPasswordStore(), id, platform, body.password, await adminActor(req));
    return NextResponse.json({ ok: true, ...saved }, { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}
