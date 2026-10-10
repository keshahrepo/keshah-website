// Admin: list + create group-interview sessions (Applications tab, and the
// founder app's Interviews page).
// GET            -> { sessions: [...], live_url }
// GET ?counts=1  -> sessions from 14 days back to 60 days ahead, each with
//                   total / opened / submitted / checked_in, plus
//                   current (the slug /interview/live resolves to, else the
//                   next upcoming) and video (counts for /interview/video).
// POST { title?, starts_at (ISO), slug? } -> { session }
// Sessions are created automatically for every Calendly group-interview time
// (lib/interview.ts ensureSessionForStart), so POST is optional now.

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireDashboardSession } from "@/lib/support/auth";
import {
  LIVE_SLUG,
  SESSIONS,
  VIDEO_SLUG,
  getSessionApplicants,
  interviewUrl,
  isAcceptingNow,
  isoOrNull,
  resolveSession,
  sessionClosesAtMs,
  sessionFromDoc,
  type InterviewSession,
} from "@/lib/interview";
import { sameSlot } from "@/lib/interview-auto";
import type { DocumentSnapshot } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const DAY = 24 * 60 * 60 * 1000;

function countsFor(docs: DocumentSnapshot[]) {
  let opened = 0;
  let submitted = 0;
  let checkedIn = 0;
  for (const d of docs) {
    const x = (d.data() ?? {}) as Record<string, unknown>;
    if (x.interview_video_submitted_at) submitted++;
    if (x.interview_opened_at) opened++;
    if (x.interview_checked_in_for && x.interview_checked_in_for === x.calendly_event_start_time && x.interview_checked_in_at) checkedIn++;
  }
  return { total: docs.length, opened, submitted, checked_in: checkedIn };
}

function sessionJson(s: InterviewSession, now: number) {
  return {
    slug: s.slug,
    title: s.title,
    starts_at: s.starts_at_ms ? new Date(s.starts_at_ms).toISOString() : null,
    closes_at: s.slug === VIDEO_SLUG ? null : new Date(sessionClosesAtMs(s)).toISOString(),
    is_open: s.is_open,
    accepting: isAcceptingNow(s, now),
    url: interviewUrl(s.slug),
  };
}

// Founder app: recent + upcoming sessions with live counts.
async function listWithCounts() {
  const { db } = getFirebaseAdmin();
  const now = Date.now();
  const snap = await db.collection(SESSIONS).orderBy("starts_at", "desc").limit(60).get();
  const all = snap.docs
    .map((d) => sessionFromDoc(d))
    .filter((s): s is InterviewSession => !!s && s.starts_at_ms > now - 14 * DAY && s.starts_at_ms < now + 60 * DAY);
  const [rows, live, videoSession] = await Promise.all([
    Promise.all(
      all.map(async (s) => ({ ...sessionJson(s, now), ...countsFor(await getSessionApplicants(db, s)) })),
    ),
    resolveSession(db, LIVE_SLUG),
    resolveSession(db, VIDEO_SLUG),
  ]);
  const video = videoSession
    ? { ...sessionJson(videoSession, now), title: "Video link", ...countsFor(await getSessionApplicants(db, videoSession)) }
    : null;
  // Current: what the live QR points at; else the next one coming up.
  const upcoming = rows
    .filter((r) => r.starts_at && Date.parse(r.starts_at) > now)
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
  const current = live?.slug ?? upcoming[0]?.slug ?? null;
  return NextResponse.json({ sessions: rows, current, video, live_url: interviewUrl(LIVE_SLUG) });
}

export async function GET(req: Request) {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (new URL(req.url).searchParams.get("counts") === "1") return await listWithCounts();
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
    // Sessions are made automatically for every booked time; don't add a
    // second one for the same slot.
    const near = await db
      .collection(SESSIONS)
      .where("starts_at", ">=", Timestamp.fromMillis(startsMs - 30 * 60 * 1000))
      .where("starts_at", "<=", Timestamp.fromMillis(startsMs + 30 * 60 * 1000))
      .limit(5)
      .get();
    const dup = near.docs.map((d) => sessionFromDoc(d)).find((s) => s && sameSlot(s.starts_at_ms, startsMs));
    if (dup) {
      return NextResponse.json(
        { error: `There's already a session at that time: ${dup.title}.`, session: { slug: dup.slug, title: dup.title, url: interviewUrl(dup.slug) } },
        { status: 409 },
      );
    }
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
