import { NextRequest, NextResponse } from "next/server";
import { creatorAccountPasswords, firestoreAccountPasswordStore } from "@/lib/creators/account-passwords";
import { errorResponse, requireCreator } from "../_auth";

export const dynamic = "force-dynamic";

// GET: the signed-in creator's own TikTok and Instagram passwords, generated
// the first time they're asked for (the account step), the same every time after.
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const passwords = await creatorAccountPasswords(await firestoreAccountPasswordStore(), creator.id);
    return NextResponse.json({ passwords, keshah_email: creator.keshah_email || null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e, "account passwords");
  }
}
