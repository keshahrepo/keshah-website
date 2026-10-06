// Admin: list + create group-interview sessions (Applications tab).
// GET  -> { sessions: [...] }
// POST { title?, starts_at (ISO), slug? } -> { session }

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireDashboardSession } from "@/lib/support/auth";
import { LIVE_SLUG, SESSIONS, interviewUrl, isoOrNull, sessionFromDoc } from "@/lib/interview";

export const dynamic = "force-dynamic";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET() {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { db } = getFirebaseAdmin();
    const snap = await db.collection(SESSIONS).orderBy("starts_at", "desc").limit(50).get();
    const sessions = snap.docs.map((d) => {
      const s = sessionFromDoc(d)!;
      return {
        slug: s.slug,
        title: s.title,
        starts_at: new Date(s.starts_at_ms).toISOString(),
        follow_up_hours: s.follow_up_hours,
        is_open: s.is_open,
        created_at: isoOrNull(d.get("created_at")),
        url: interviewUrl(s.slug),
      };
    });
    return NextResponse.json({ sessions, live_url: interviewUrl(LIVE_SLUG) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const b = (await req.json()) as {
      title?: string;
      starts_at?: string;
      slug?: string;
      tz_offset_min?: number;
    };
    const startsMs = Date.parse(b.starts_at ?? "");
    if (!startsMs) {
      return NextResponse.json({ error: "Pick a date and time." }, { status: 400 });
    }
    // Default slug from the admin's local date, e.g. "oct-7". The client
    // sends its timezone offset so the server (UTC) names it by the date
    // the admin picked, not the UTC date.
    const local = new Date(startsMs - (b.tz_offset_min ?? 0) * 60 * 1000);
    const base =
      slugify(b.slug ?? "") ||
      `${MONTHS[local.getUTCMonth()]}-${local.getUTCDate()}`;
    if (base === LIVE_SLUG) {
      return NextResponse.json({ error: `"${LIVE_SLUG}" is reserved.` }, { status: 400 });
    }

    const { db } = getFirebaseAdmin();
    let slug = base;
    for (let i = 2; (await db.collection(SESSIONS).doc(slug).get()).exists; i++) {
      slug = `${base}-${i}`;
    }
    const title = (b.title ?? "").trim() || `Group interview ${base}`;
    await db.collection(SESSIONS).doc(slug).set({
      slug,
      title,
      starts_at: Timestamp.fromMillis(startsMs),
      follow_up_hours: 24,
      is_open: true,
      created_at: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ session: { slug, title, url: interviewUrl(slug) } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
