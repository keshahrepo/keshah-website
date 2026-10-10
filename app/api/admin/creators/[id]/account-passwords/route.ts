import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { accountPasswordStatus, firestoreAccountPasswordStore } from "@/lib/creators/account-passwords";
import { CreatorDataError } from "@/lib/creators/db";
import { encryptionConfigured } from "@/lib/creators/secure";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// GET: whether each account password is saved and who set it. Never the passwords.
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const status = await accountPasswordStatus(await firestoreAccountPasswordStore(), id);
    return NextResponse.json({ enabled: encryptionConfigured(), ...status }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("account password status error:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
