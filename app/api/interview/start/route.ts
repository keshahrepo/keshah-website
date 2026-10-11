// Public: email step of /interview/[slug].
// POST { slug, email, full_name?, gender? }
//
// Matches the email to an existing careers_applications doc
// (case-insensitive) and tags it with the session. If there's no match
// (or the match has no gender on file), responds needs_details so the
// page asks for name + gender, then the client calls again with them and
// we create a minimal application (source: "group_interview").
//
// Unknown email: the page first asks "Is this the email you applied with?"
// (needs_details + unknown_email) so a typo can be fixed. If they continue,
// the new doc is tagged interview_unmatched_email + the session, and any
// application booked into this session's slot that looks like the same
// person (same name, or an email a typo away) is flagged with
// interview_possible_duplicate_id: the follow-up cron then sends it no
// no-show email/text and never auto-denies it; the founder sorts it out.

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import {
  APPLICATIONS,
  findApplicationByEmail,
  getSessionApplicants,
  isAcceptingNow,
  resolveSession,
} from "@/lib/interview";
import { isDecided, looksLikeSamePerson } from "@/lib/interview-decisions";
import { bookedIntoSlot, openedSession } from "@/lib/interview-reminders";

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
      return NextResponse.json({ needs_details: true, need_name: true, need_gender: true, unknown_email: true });
    }
    const created = await db.collection(APPLICATIONS).add({
      listing_slug: "paid-creator-intern",
      full_name: givenName,
      email: email.toLowerCase(),
      gender: givenGender,
      source: session.slug === "video" ? "video_link" : "group_interview",
      status: "booked",
      interview_session: session.slug,
      interview_opened_at: now,
      created_at: now,
      submitted_at: now,
      last_updated_at: now,
      user_agent: req.headers.get("user-agent") ?? null,
      interview_unmatched_email: true,
    });
    console.warn(`interview start: new application ${created.id} for unknown email ${email.toLowerCase()} in ${session.slug}`);
    // Booked into this slot, hasn't opened the page, and looks like the same
    // person: probably the application they meant. Flag both. Never fails the start.
    if (session.starts_at_ms > 0) {
      try {
        const others = (await getSessionApplicants(db, session)).filter((d) => {
          if (d.id === created.id) return false;
          const x = (d.data() ?? {}) as Record<string, unknown>;
          if (isDecided(x.status) || openedSession(x, session.slug) || x.interview_video_submitted_at) return false;
          return bookedIntoSlot(x, session.starts_at_ms) && looksLikeSamePerson({ full_name: givenName, email }, x);
        });
        if (others.length) {
          await created.set({ interview_possible_duplicate_of: others.map((d) => d.id) }, { merge: true });
          for (const d of others) await d.ref.set({ interview_possible_duplicate_id: created.id }, { merge: true });
          console.warn(`interview start: ${created.id} may be the same person as ${others.map((d) => d.id).join(", ")}`);
        }
      } catch (e) {
        console.error("interview start: duplicate check failed:", e instanceof Error ? e.message : e);
      }
    }
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
