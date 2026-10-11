/**
 * "Signed in to the app" for the founder's creator Progress timeline.
 *
 * GET /api/mobile/me runs on every app start (and right after sign-in), so it
 * stamps the creator doc:
 *   ContentCreators/{id}.app_first_signed_in_at  set once, never overwritten
 *   ContentCreators/{id}.app_last_seen_at        refreshed at most once an hour
 * One doc read per call; a write only when something changes.
 *
 * The app also sends the phone's IANA time zone (?tz=). It's stored as the
 * creator's timezone only while nothing better is known: no timezone yet, or
 * still the America/New_York default, and not set from Calendly or by the
 * founder. timezone_source records where it came from (calendly | device | founder).
 */
import type { Firestore } from "firebase-admin/firestore";
import { CREATORS_COLLECTION, DEFAULT_TIMEZONE } from "@/lib/creators/db";
import { isValidTimezone } from "@/lib/creators/time";

export const APP_SEEN_REFRESH_MS = 3_600_000;

const iso = (v: unknown): string | null => {
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
};

/** The fields to write for an app open at `now`, or null when nothing needs writing. */
export function appSeenUpdate(doc: Record<string, unknown> | undefined, now: Date): Record<string, string> | null {
  const out: Record<string, string> = {};
  const nowIso = now.toISOString();
  if (!iso(doc?.app_first_signed_in_at)) out.app_first_signed_in_at = nowIso;
  const last = Date.parse(iso(doc?.app_last_seen_at) ?? "");
  if (!Number.isFinite(last) || now.getTime() - last >= APP_SEEN_REFRESH_MS) out.app_last_seen_at = nowIso;
  return Object.keys(out).length ? out : null;
}

export type TimezoneSource = "calendly" | "device" | "founder";

/** { timezone, timezone_source } to write for the phone's zone, or null to leave the creator's alone. */
export function deviceTimezoneUpdate(
  doc: Record<string, unknown> | undefined,
  deviceTz: string | null | undefined,
): { timezone: string; timezone_source: "device" } | null {
  const tz = typeof deviceTz === "string" ? deviceTz.trim() : "";
  if (!tz || !tz.includes("/") || !isValidTimezone(tz)) return null;
  // Founder- or Calendly-set wins; a device zone already stored stays put
  // (travel shouldn't move the deadline).
  const source = doc?.timezone_source;
  if (source === "founder" || source === "calendly" || source === "device") return null;
  const current = typeof doc?.timezone === "string" ? doc.timezone.trim() : "";
  if (current && current !== DEFAULT_TIMEZONE) return null;
  return { timezone: tz, timezone_source: "device" };
}

export async function recordAppSeen(db: Firestore, creatorId: string, now: Date = new Date(), deviceTz?: string | null): Promise<void> {
  const ref = db.collection(CREATORS_COLLECTION).doc(creatorId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const upd = { ...(appSeenUpdate(snap.data(), now) ?? {}), ...(deviceTimezoneUpdate(snap.data(), deviceTz) ?? {}) };
  if (Object.keys(upd).length) await ref.update(upd);
}
