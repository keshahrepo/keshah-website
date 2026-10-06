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

import type { Firestore, DocumentSnapshot } from "firebase-admin/firestore";

export const SESSIONS = "interview_sessions";
export const APPLICATIONS = "careers_applications";

// Slug "live" is reserved: /interview/live resolves to the current open
// session so the presentation QR code never needs regenerating.
export const LIVE_SLUG = "live";

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
  return s.starts_at_ms + s.follow_up_hours * 60 * 60 * 1000;
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
