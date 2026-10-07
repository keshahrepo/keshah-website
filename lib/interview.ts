// Shared server helpers for the group-interview video test
// (/interview/[slug]). Sessions live in `interview_sessions`, one doc per
// group interview, keyed by slug. Applicants are regular
// `careers_applications` docs tagged with `interview_session: <slug>`.
//
// An applicant belongs to a session if EITHER:
//   - they're tagged with interview_session == slug (they opened the
//     page, or were created there), OR
//   - their Calendly booking start time falls within ±30 min of the
//     session's starts_at (booked into that group call but haven't
//     opened the page yet).

import type { Firestore, DocumentSnapshot, DocumentReference } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

export const SESSIONS = "interview_sessions";
export const APPLICATIONS = "careers_applications";

// Slug "live" is reserved: /interview/live resolves to the current open
// session so the presentation QR code never needs regenerating.
export const LIVE_SLUG = "live";

// Always-open link for applicants who couldn't film on the call, or who
// skip the group interview: /interview/video. Not a Firestore session, so
// it never closes and the follow-up cron (which walks real sessions) leaves
// it alone.
export const VIDEO_SLUG = "video";
const VIDEO_SESSION: InterviewSession = {
  slug: VIDEO_SLUG,
  title: "Video test",
  starts_at_ms: 0,
  follow_up_hours: 1_000_000,
  is_open: true,
};

export const SITE_URL = "https://www.keshah.com";

export type InterviewSession = {
  slug: string;
  title: string;
  starts_at_ms: number;
  follow_up_hours: number;
  is_open: boolean;
};

function tsToMs(v: unknown): number {
  if (v && typeof v === "object" && "toMillis" in (v as object)) {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "string") return Date.parse(v) || 0;
  if (typeof v === "number") return v;
  return 0;
}

export function sessionFromDoc(d: DocumentSnapshot): InterviewSession | null {
  if (!d.exists) return null;
  const x = d.data() as Record<string, unknown>;
  return {
    slug: d.id,
    title: (x.title as string) || d.id,
    starts_at_ms: tsToMs(x.starts_at),
    follow_up_hours:
      typeof x.follow_up_hours === "number" ? x.follow_up_hours : 24,
    is_open: x.is_open === true,
  };
}

// Time after which the link is closed for everyone who hasn't submitted.
export function sessionClosesAtMs(s: InterviewSession): number {
  // Video deadline: 11:59 PM Eastern on the day after the interview (a clean
  // time applicants can remember). The always-open video link never closes.
  if (s.follow_up_hours >= 100_000) return s.starts_at_ms + s.follow_up_hours * 60 * 60 * 1000;
  return endOfNextEasternDayMs(s.starts_at_ms);
}

/** 23:59:00 America/New_York on the calendar day after `ms` (Eastern date). */
export function endOfNextEasternDayMs(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Guess as if Eastern were UTC, then correct by the real offset at that moment.
  const guess = Date.UTC(get("year"), get("month") - 1, get("day") + 1, 23, 59, 0);
  const offsetMin = (at: number) => {
    const tz = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
      .formatToParts(new Date(at))
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
    const m = tz.match(/GMT([+-]\d+)(?::(\d+))?/);
    return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0) : -300;
  };
  return guess - offsetMin(guess) * 60 * 1000;
}

// Is the page accepting submissions right now?
export function isAcceptingNow(s: InterviewSession, now = Date.now()): boolean {
  return s.is_open && now < sessionClosesAtMs(s);
}

export function interviewUrl(slug: string): string {
  return `${SITE_URL}/interview/${slug}`;
}

// Resolve a slug to a session. "live" picks the most recent open session
// that has started (or starts within the next hour); if none has started
// yet, the soonest upcoming open one.
export async function resolveSession(
  db: Firestore,
  slug: string,
): Promise<InterviewSession | null> {
  const clean = slug.trim().toLowerCase();
  if (clean === VIDEO_SLUG) return VIDEO_SESSION;
  if (clean !== LIVE_SLUG) {
    const d = await db.collection(SESSIONS).doc(clean).get();
    return sessionFromDoc(d);
  }
  const snap = await db.collection(SESSIONS).where("is_open", "==", true).get();
  const now = Date.now();
  const open = snap.docs
    .map((d) => sessionFromDoc(d))
    .filter((s): s is InterviewSession => !!s && isAcceptingNow(s, now));
  if (open.length === 0) return null;
  const started = open
    .filter((s) => s.starts_at_ms <= now + 60 * 60 * 1000)
    .sort((a, b) => b.starts_at_ms - a.starts_at_ms);
  if (started.length) return started[0];
  return open.sort((a, b) => a.starts_at_ms - b.starts_at_ms)[0];
}

// Case-insensitive email match. The apply flow stores emails lowercased,
// but try the raw input too in case an older doc kept its casing. Most
// recently updated doc wins.
export async function findApplicationByEmail(
  db: Firestore,
  rawEmail: string,
): Promise<DocumentSnapshot | null> {
  const raw = rawEmail.trim();
  const lower = raw.toLowerCase();
  const variants = Array.from(new Set([lower, raw]));
  const docs: DocumentSnapshot[] = [];
  for (const v of variants) {
    const q = await db.collection(APPLICATIONS).where("email", "==", v).limit(10).get();
    docs.push(...q.docs);
  }
  if (docs.length === 0) return null;
  // Prefer an active application (not denied/withdrawn) so someone who
  // re-applied after a rejection gets their video on the current one; then
  // the most recently updated.
  const inactive = (d: DocumentSnapshot) => ["denied", "rejected", "withdrawn"].includes(String(d.get("status") ?? ""));
  docs.sort((a, b) => {
    const ai = inactive(a) ? 1 : 0;
    const bi = inactive(b) ? 1 : 0;
    if (ai !== bi) return ai - bi;
    const am = tsToMs(a.get("last_updated_at"));
    const bm = tsToMs(b.get("last_updated_at"));
    return bm - am;
  });
  return docs[0];
}

// Everyone who belongs to a session (tagged OR booked into its time slot).
export async function getSessionApplicants(
  db: Firestore,
  s: InterviewSession,
): Promise<DocumentSnapshot[]> {
  const byId = new Map<string, DocumentSnapshot>();
  const tagged = await db
    .collection(APPLICATIONS)
    .where("interview_session", "==", s.slug)
    .get();
  for (const d of tagged.docs) byId.set(d.id, d);

  if (s.starts_at_ms > 0) {
    // calendly_event_start_time is an ISO string (e.g.
    // "2026-10-07T18:00:00.000000Z"), so a lexical range works.
    const lo = new Date(s.starts_at_ms - 30 * 60 * 1000).toISOString();
    const hi = new Date(s.starts_at_ms + 30 * 60 * 1000).toISOString();
    const booked = await db
      .collection(APPLICATIONS)
      .where("calendly_event_start_time", ">=", lo)
      .where("calendly_event_start_time", "<=", hi)
      .get();
    for (const d of booked.docs) {
      // Someone booked into this slot but tagged to a different session
      // (e.g. rescheduled and opened another link) belongs there.
      const tag = d.get("interview_session");
      if (tag && tag !== s.slug) continue;
      if (!byId.has(d.id)) byId.set(d.id, d);
    }
  }
  return Array.from(byId.values());
}

export function isoOrNull(v: unknown): string | null {
  const ms = tsToMs(v);
  return ms ? new Date(ms).toISOString() : null;
}

// Create-once marker for emails / texts that must go out at most once, safe
// with overlapping cron runs. Inside a transaction, `decide` sees the fresh
// doc and returns the patch that claims the send (e.g. { x_sent_at: now }),
// or null when it's already claimed. Returns whether this caller won.
export async function claimOnce(
  db: Firestore,
  ref: DocumentReference,
  decide: (data: Record<string, unknown>) => Record<string, unknown> | null,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const patch = decide((snap.data() ?? {}) as Record<string, unknown>);
    if (!patch) return false;
    tx.set(ref, patch, { merge: true });
    return true;
  });
}

// Undo a claim when the send itself failed, so the next run retries.
export async function releaseClaim(ref: DocumentReference, field: string): Promise<void> {
  await ref.update({ [field]: FieldValue.delete() });
}

// Settings/creator_portal.interview_recording_url: a recording of the group
// interview presentation, linked in the no-show email. Empty = omit.
export const PORTAL_SETTINGS = { collection: "Settings", doc: "creator_portal" } as const;
export const RECORDING_URL_FIELD = "interview_recording_url";

export async function getInterviewRecordingUrl(db: Firestore): Promise<string | null> {
  const snap = await db.collection(PORTAL_SETTINGS.collection).doc(PORTAL_SETTINGS.doc).get();
  const v = snap.exists ? snap.get(RECORDING_URL_FIELD) : null;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
