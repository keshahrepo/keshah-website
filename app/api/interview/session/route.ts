// Public: resolve an interview session for /interview/[slug].
// GET ?slug=oct-7  (or slug=live for the current open session)

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { isAcceptingNow, resolveSession } from "@/lib/interview";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug") ?? "";
    if (!slug) return NextResponse.json({ open: false });
    const { db } = getFirebaseAdmin();
    const s = await resolveSession(db, slug);
    if (!s || !isAcceptingNow(s)) {
      return NextResponse.json({ open: false });
    }
    return NextResponse.json({
      open: true,
      session: { slug: s.slug, title: s.title },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
