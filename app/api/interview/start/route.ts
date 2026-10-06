// Public: email step of /interview/[slug].
// POST { slug, email, full_name?, gender? }
//
// Matches the email to an existing careers_applications doc
// (case-insensitive) and tags it with the session. If there's no match
// (or the match has no gender on file), responds needs_details so the
// page asks for name + gender, then the client calls again with them and
// we create a minimal application (source: "group_interview").

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import {
  APPLICATIONS,
  findApplicationByEmail,
  isAcceptingNow,
  resolveSession,
} from "@/lib/interview";

type Body = { slug?: string; email?: string; full_name?: string; gender?: string };

function normGender(g: unknown): "male" | "female" | null {
  const v = String(g ?? "").trim().toLowerCase();
  if (v === "male" || v === "man" || v === "m") return "male";
  if (v === "female" || v === "woman" || v === "f") return "female";
  return null;
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Body;
    const email = (b.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
    }
    const { db } = getFirebaseAdmin();
    const session = await resolveSession(db, b.slug ?? "");
    if (!session || !isAcceptingNow(session)) {
      return NextResponse.json({ closed: true });
    }

    const givenName = (b.full_name ?? "").trim();
    const givenGender = normGender(b.gender);
    const now = FieldValue.serverTimestamp();
    const doc = await findApplicationByEmail(db, email);

    if (doc) {
      const x = (doc.data() ?? {}) as Record<string, unknown>;
      const sameSession = x.interview_session === session.slug;
      if (sameSession && x.interview_link_closed_at && !x.interview_video_submitted_at) {
        return NextResponse.json({ closed: true });
      }
      const fullName = ((x.full_name as string) ?? "").trim() || givenName;
      const gender = normGender(x.gender) ?? givenGender;
      if (!fullName || !gender) {
        return NextResponse.json({
          needs_details: true,
          need_name: !fullName,
          need_gender: !gender,
        });
      }
      const update: Record<string, unknown> = {
        interview_session: session.slug,
        interview_opened_at: x.interview_opened_at && sameSession ? x.interview_opened_at : now,
        last_updated_at: now,
      };
      if (!((x.full_name as string) ?? "").trim()) update.full_name = fullName;
      if (!normGender(x.gender)) update.gender = gender;
      await doc.ref.set(update, { merge: true });
      return NextResponse.json({
        ok: true,
        first_name: fullName.split(/\s+/)[0],
        gender,
        already_submitted: sameSession && !!x.interview_video_submitted_at,
      });
    }

    if (!givenName || !givenGender) {
      return NextResponse.json({ needs_details: true, need_name: true, need_gender: true });
    }
    await db.collection(APPLICATIONS).add({
      listing_slug: "paid-creator-intern",
      full_name: givenName,
      email: email.toLowerCase(),
      gender: givenGender,
      source: "group_interview",
      status: "booked",
      interview_session: session.slug,
      interview_opened_at: now,
      created_at: now,
      submitted_at: now,
      last_updated_at: now,
      user_agent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({
      ok: true,
      first_name: givenName.split(/\s+/)[0],
      gender: givenGender,
      already_submitted: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
