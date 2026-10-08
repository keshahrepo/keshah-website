/**
 * Creator pay system: server-only data access, shared by the creator portal
 * (/creator, /api/creator/*) and the admin screens.
 *
 * Source of truth: the `ContentCreators` collection (where logins live). See
 * lib/creators/types.ts for the full Firestore layout. Every write here is
 * additive: existing ContentCreators fields (status, videos_per_day, streak,
 * password_*, manager_id, ...) are read, never rewritten, except `status`
 * which admins may set to a CreatorStatus via updateCreatorProfile.
 *
 * Errors meant for the user are thrown as CreatorDataError (with an HTTP
 * status); API routes should catch and return `{ error: e.message }`.
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getStorage } from "firebase-admin/storage";
import type { DocumentData, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import {
  videosRequiredOn,
  isScheduledDay,
  trialWindow,
  addMonths,
  completeVideoCount,
  creatorPrefix,
  draftInvoiceLines,
  invoiceNumber,
  isOnTime,
  isWeekday,
  localDate,
  monthOf,
  monthSummary,
  nextLevel,
  trialStatus,
  weekdaysBetween,
  type MonthSummary,
} from "./pay";
import { FOUNDER_VIDEOS, QUIZ, WARMUP_DAYS } from "./onboarding-content";
import { handleExists, postKey } from "./scrape";
import { isValidTimezone } from "./time";
import { autoSubmitFields, disputeUpdate, InvoiceRuleError } from "./invoice-auto";
import type {
  Adjustment,
  BonusClaim,
  CreatorContract,
  CreatorProfile,
  CreatorStatus,
  DayOff,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  OnboardingState,
  OnboardingStep,
  OnboardingStepKey,
  Platform,
  PostedVideo,
  PostingDay,
  YyyyMm,
  YyyyMmDd,
} from "./types";

export const CREATORS_COLLECTION = "ContentCreators";
export const LINKS_COLLECTION = "Creators";
export const DEFAULT_TIMEZONE = "America/New_York";
export const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "keshah-app.appspot.com";
const MAX_VIDEO_ROWS = 20;

export class CreatorDataError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "CreatorDataError";
  }
}

// ---------------------------------------------------------------- helpers

function fs(): Firestore {
  return getFirebaseAdmin().db;
}

function creatorRef(id: string) {
  return fs().collection(CREATORS_COLLECTION).doc(id);
}

/** Firestore Timestamp | Date | string -> ISO string. */
function toIso(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  const t = v as { toDate?: () => Date };
  if (typeof t.toDate === "function") return t.toDate().toISOString();
  return undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export function isYyyyMmDd(s: unknown): s is YyyyMmDd {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isYyyyMm(s: unknown): s is YyyyMm {
  return typeof s === "string" && MONTH_RE.test(s) && Number(s.slice(5)) >= 1 && Number(s.slice(5)) <= 12;
}

function monthFirst(m: YyyyMm): YyyyMmDd {
  return `${m}-01`;
}

function monthLast(m: YyyyMm): YyyyMmDd {
  const d = new Date(`${addMonths(m, 1)}-01T00:00:00Z`);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

const NEW_STATUSES: CreatorStatus[] = ["onboarding", "trial", "active", "leaving", "ended"];

/** Map ContentCreators.status (legacy values "trial" | "active" | "cut") to CreatorStatus. */
export function mapCreatorStatus(raw: unknown): CreatorStatus {
  if (typeof raw !== "string" || !raw) return "onboarding";
  if ((NEW_STATUSES as string[]).includes(raw)) return raw as CreatorStatus;
  if (raw === "cut" || raw === "inactive") return "ended";
  return "active";
}

/**
 * Pay starts on the creator's FIRST POSTING DAY: savePostingDay fills
 * start_date when it's unset. Until then start_date is "" ("not started").
 * Legacy creators (no onboarding doc and not flagged start_mode
 * "first_post") keep the old fallback start_date -> trial_start_date ->
 * created_at.
 */
function usesLegacyStart(d: DocumentData, hasOnboarding: boolean): boolean {
  return !hasOnboarding && d.start_mode !== "first_post";
}

function toProfile(id: string, d: DocumentData, legacyStart: boolean): CreatorProfile {
  const contract = (d.contract ?? {}) as Partial<CreatorContract>;
  const startDate: string =
    (isYyyyMmDd(d.start_date) && d.start_date) ||
    (legacyStart
      ? (isYyyyMmDd(d.trial_start_date) && d.trial_start_date) ||
        (toIso(d.created_at)?.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
      : "");
  return {
    id,
    // legacy
    name: d.name ?? "",
    is_active: d.is_active !== false,
    manager_id: d.manager_id ?? null,
    videos_per_day: Number(d.videos_per_day ?? 0),
    streak: Number(d.streak ?? 0),
    ...(d.trial_start_date ? { trial_start_date: d.trial_start_date } : {}),
    legacy_status: typeof d.status === "string" ? d.status : null,
    // pay
    legal_name: d.legal_name || d.name || "",
    email: d.email ?? "",
    timezone: typeof d.timezone === "string" && isValidTimezone(d.timezone) ? d.timezone : DEFAULT_TIMEZONE,
    start_date: startDate,
    starting_completed_months: Number(d.starting_completed_months ?? 0),
    ...(d.trial_plan === "v2" ? { trial_plan: "v2" as const } : {}),
    ...(d.trial_outcome === "keep" || d.trial_outcome === "end" ? { trial_outcome: d.trial_outcome } : {}),
    ...(isYyyyMmDd(d.trial_decided_on) ? { trial_decided_on: d.trial_decided_on } : {}),
    ...(isYyyyMmDd(d.trial_completed_on) ? { trial_completed_on: d.trial_completed_on } : {}),
    campaign_tags: Array.isArray(d.campaign_tags) ? d.campaign_tags : [],
    status: mapCreatorStatus(d.status),
    ...(isYyyyMmDd(d.ended_on) ? { ended_on: d.ended_on } : {}),
    contract: {
      status: contract.status ?? "none",
      ...(contract.signed_at ? { signed_at: toIso(contract.signed_at) } : {}),
      ...(contract.pdf_path ? { pdf_path: contract.pdf_path } : {}),
      ...(contract.template_version ? { template_version: contract.template_version } : {}),
      ...(contract.template_sha256 ? { template_sha256: contract.template_sha256 } : {}),
      ...(contract.sent_at ? { sent_at: toIso(contract.sent_at) } : {}),
      ...(contract.viewed_at ? { viewed_at: toIso(contract.viewed_at) } : {}),
      ...(contract.signed_sha256 ? { signed_sha256: contract.signed_sha256 } : {}),
      ...(contract.audit ? { audit: contract.audit } : {}),
    },
    w9_on_file: d.w9_on_file === true,
    payout_method: "amex_ach",
    // portal
    keshah_email: d.keshah_email ?? "",
    tiktok_handle: d.tiktok_handle ?? "",
    instagram_handle: d.instagram_handle ?? "",
    creator_link_id: d.creator_link_id || null,
    tracking_url: typeof d.tracking_url === "string" ? d.tracking_url : "",
    invoice_seq: Number(d.invoice_seq ?? 0),
    format_creator: d.format_creator === true,
    ...(typeof d.bonus_start_date === "string" && d.bonus_start_date ? { bonus_start_date: d.bonus_start_date } : {}),
  };
}

function requireCreatorData(snap: DocumentSnapshot): DocumentData {
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  return snap.data()!;
}

// ---------------------------------------------------------------- creators

export async function getCreator(id: string): Promise<CreatorProfile | null> {
  if (!id) return null;
  const [snap, onb] = await Promise.all([creatorRef(id).get(), onboardingRef(id).get()]);
  return snap.exists ? toProfile(snap.id, snap.data()!, usesLegacyStart(snap.data()!, onb.exists)) : null;
}

/** True when pay has started (start_date set, or legacy fallback). */
export function hasStarted(c: Pick<CreatorProfile, "start_date">): boolean {
  return isYyyyMmDd(c.start_date);
}

export async function listCreators(opts: { includeInactive?: boolean } = {}): Promise<CreatorProfile[]> {
  const snap = await fs().collection(CREATORS_COLLECTION).get();
  const onbSnaps = snap.empty ? [] : await fs().getAll(...snap.docs.map((d) => onboardingRef(d.id)));
  const hasOnb = new Set(onbSnaps.filter((o) => o.exists).map((o) => o.ref.parent.parent!.id));
  return snap.docs
    .map((d) => toProfile(d.id, d.data(), usesLegacyStart(d.data(), hasOnb.has(d.id))))
    .filter((c) => opts.includeInactive || c.is_active)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Fields admins may set on a creator. `invoice_seq` is managed here only. */
export type CreatorProfilePatch = Partial<
  Pick<
    CreatorProfile,
    | "legal_name"
    | "email"
    | "timezone"
    | "start_date"
    | "starting_completed_months"
    | "campaign_tags"
    | "status"
    | "contract"
    | "w9_on_file"
    | "keshah_email"
    | "tiktok_handle"
    | "instagram_handle"
    | "creator_link_id"
    | "tracking_url"
  >
> & { ended_on?: YyyyMmDd | null };

export async function updateCreatorProfile(id: string, patch: CreatorProfilePatch): Promise<CreatorProfile> {
  const out: Record<string, unknown> = {};
  const str = (k: keyof CreatorProfilePatch) => {
    if (patch[k] !== undefined) out[k] = String(patch[k] ?? "").trim();
  };
  str("legal_name");
  str("keshah_email");
  if (patch.email !== undefined) out.email = String(patch.email).toLowerCase().trim();
  if (patch.tiktok_handle !== undefined) out.tiktok_handle = normalizeHandle(patch.tiktok_handle);
  if (patch.instagram_handle !== undefined) out.instagram_handle = normalizeHandle(patch.instagram_handle);
  if (patch.creator_link_id !== undefined) out.creator_link_id = patch.creator_link_id || null;
  if (patch.tracking_url !== undefined) {
    const t = normalizeTrackingUrl(patch.tracking_url);
    if (t === null) throw new CreatorDataError("Tracking link must be a full https:// link");
    out.tracking_url = t;
  }
  if (patch.timezone !== undefined) {
    if (!isValidTimezone(patch.timezone)) throw new CreatorDataError("Unknown timezone");
    out.timezone = patch.timezone;
  }
  if (patch.start_date !== undefined) {
    if (!isYyyyMmDd(patch.start_date)) throw new CreatorDataError("start_date must be yyyy-mm-dd");
    out.start_date = patch.start_date;
  }
  if (patch.ended_on !== undefined) {
    if (patch.ended_on !== null && !isYyyyMmDd(patch.ended_on)) throw new CreatorDataError("ended_on must be yyyy-mm-dd");
    out.ended_on = patch.ended_on ?? null;
  }
  if (patch.starting_completed_months !== undefined) {
    const n = Number(patch.starting_completed_months);
    if (!Number.isInteger(n) || n < 0) throw new CreatorDataError("starting_completed_months must be a whole number");
    out.starting_completed_months = n;
  }
  if (patch.campaign_tags !== undefined) out.campaign_tags = patch.campaign_tags.map((t) => String(t).trim()).filter(Boolean);
  if (patch.status !== undefined) {
    if (!NEW_STATUSES.includes(patch.status)) throw new CreatorDataError("Unknown status");
    out.status = patch.status;
    out.status_changed_at = new Date();
  }
  if (patch.contract !== undefined) out.contract = patch.contract;
  if (patch.w9_on_file !== undefined) out.w9_on_file = !!patch.w9_on_file;
  out.payout_method = "amex_ach";
  await creatorRef(id).update(out);
  const c = await getCreator(id);
  if (!c) throw new CreatorDataError("Creator not found", 404);
  return c;
}

/** "" stays "" (cleared); a valid https URL is returned trimmed; anything else -> null (invalid). */
export function normalizeTrackingUrl(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !!u.hostname ? s : null;
  } catch {
    return null;
  }
}

export function normalizeHandle(h: string): string {
  return String(h ?? "").trim().replace(/^@+/, "").replace(/\s+/g, "");
}

/**
 * The creator's old keshah.com short link (from the linked Creators doc).
 * NOT shown to creators any more (keshah.com/<slug> 404s since 423dbef); the
 * portal shows ContentCreators.tracking_url instead.
 */
export async function getCreatorLink(
  creator: Pick<CreatorProfile, "creator_link_id">,
): Promise<{ id: string; slug: string; short_link: string } | null> {
  if (!creator.creator_link_id) return null;
  const snap = await fs().collection(LINKS_COLLECTION).doc(creator.creator_link_id).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  const slug = d.slug ?? "";
  return { id: snap.id, slug, short_link: d.short_link || (slug ? `https://keshah.com/${slug}` : "") };
}

/** "Today" (yyyy-mm-dd) in the creator's timezone. */
export function creatorToday(creator: Pick<CreatorProfile, "timezone">, now: Date = new Date()): YyyyMmDd {
  return localDate(now.toISOString(), creator.timezone);
}

// ---------------------------------------------------------------- history

export type WithId<T> = T & { id: string };

export interface CreatorHistory {
  postingDays: PostingDay[];
  daysOff: DayOff[];
  bonusClaims: WithId<BonusClaim>[];
  adjustments: WithId<Adjustment>[];
  invoices: Invoice[];
}

export function toPostingDay(id: string, d: DocumentData): PostingDay {
  return {
    date: d.date || id,
    videos: Array.isArray(d.videos)
      ? d.videos.map((v: Partial<PostedVideo>) => ({
          tiktok_url: v?.tiktok_url ?? "",
          instagram_url: v?.instagram_url ?? "",
          ...(v?.inspired_by_url ? { inspired_by_url: v.inspired_by_url } : {}),
          ...(v?.proven_id ? { proven_id: String(v.proven_id) } : {}),
        }))
      : [],
    logged_at: toIso(d.logged_at) ?? "",
    ...(Array.isArray(d.auto_urls) && d.auto_urls.length ? { auto_urls: d.auto_urls.map(String) } : {}),
  };
}

function toDayOff(id: string, d: DocumentData): DayOff {
  return {
    date: d.date || id,
    status: d.status ?? "requested",
    ...(d.reason ? { reason: d.reason } : {}),
    ...(d.requested_at ? { requested_at: toIso(d.requested_at) } : {}),
    ...(d.decided_at ? { decided_at: toIso(d.decided_at) } : {}),
  };
}

function toInvoice(id: string, d: DocumentData): Invoice {
  return {
    ...(d as Invoice),
    number: d.number || id,
    lines: Array.isArray(d.lines) ? d.lines : [],
    total_cents: Number(d.total_cents ?? 0),
    locked: d.locked === true || d.status === "paid",
  };
}

/** Full history (the ladder needs every month). Subcollections are small. */
export async function getHistory(id: string): Promise<CreatorHistory> {
  const ref = creatorRef(id);
  const [pd, off, bc, adj, inv] = await Promise.all([
    ref.collection("posting_days").get(),
    ref.collection("days_off").get(),
    ref.collection("bonus_claims").get(),
    ref.collection("adjustments").get(),
    ref.collection("invoices").get(),
  ]);
  return {
    postingDays: pd.docs.map((d) => toPostingDay(d.id, d.data())).sort((a, b) => a.date.localeCompare(b.date)),
    daysOff: off.docs.map((d) => toDayOff(d.id, d.data())).sort((a, b) => a.date.localeCompare(b.date)),
    bonusClaims: bc.docs
      .map((d) => ({ ...(d.data() as BonusClaim), id: d.id, claimed_at: toIso(d.data().claimed_at) }))
      .sort((a, b) => (b.claimed_at ?? "").localeCompare(a.claimed_at ?? "")),
    adjustments: adj.docs.map((d) => ({ ...(d.data() as Adjustment), id: d.id })),
    invoices: inv.docs.map((d) => toInvoice(d.id, d.data())).sort((a, b) => b.month.localeCompare(a.month)),
  };
}

/** One month's records. Bonus claims are included if posted or crossed in the month, or posted the month before (paid this month). */
export async function getMonthData(id: string, month: YyyyMm): Promise<CreatorHistory> {
  const h = await getHistory(id);
  const prev = addMonths(month, -1);
  const inMonth = (d?: string) => !!d && d.startsWith(month);
  const inPrev = (d?: string) => !!d && d.startsWith(prev);
  return {
    postingDays: h.postingDays.filter((p) => inMonth(p.date)),
    daysOff: h.daysOff.filter((d) => inMonth(d.date)),
    bonusClaims: h.bonusClaims.filter((c) => inMonth(c.posted_on) || inPrev(c.posted_on) || inMonth(c.crossed_100k_on) || inMonth(c.crossed_1m_on)),
    adjustments: h.adjustments.filter((a) => a.month === month),
    invoices: h.invoices.filter((i) => i.month === month),
  };
}

export interface MonthOverview {
  summary: MonthSummary;
  lines: InvoiceLine[];
  nextLevel: ReturnType<typeof nextLevel>;
  trial: ReturnType<typeof trialStatus>;
}

/**
 * Pay summary for a month. For the creator's current (or a future) month,
 * `today` is applied so remaining weekdays count as pending.
 */
export async function getMonthOverview(
  creator: CreatorProfile,
  month: YyyyMm,
  opts: { now?: Date; history?: CreatorHistory } = {},
): Promise<MonthOverview> {
  const h = opts.history ?? (await getHistory(creator.id));
  const today = creatorToday(creator, opts.now);
  if (!hasStarted(creator)) {
    // Not started: no weekday is >= this sentinel, so everything is zero.
    const summary = monthSummary({ ...creator, start_date: NOT_STARTED_SENTINEL }, month, [], [], h.bonusClaims, h.adjustments);
    return {
      summary,
      lines: draftInvoiceLines(summary),
      nextLevel: { nextBaseCents: null, monthsNeeded: null, earliestMonth: null },
      trial: creatorTrial(creator, h.postingDays),
    };
  }
  const summary = monthSummary(creator, month, h.postingDays, h.daysOff, h.bonusClaims, h.adjustments, {
    ...(month >= monthOf(today) ? { today } : {}),
  });
  return {
    summary,
    lines: draftInvoiceLines(summary),
    nextLevel: nextLevel(creator, { postingDays: h.postingDays, daysOff: h.daysOff }, month),
    trial: creatorTrial(creator, h.postingDays),
  };
}

/**
 * The first-two-weeks trial, except for creators who are past it already: made active
 * by an admin, or credited with earlier months (Isai's September).
 */
export function creatorTrial(
  creator: Pick<CreatorProfile, "status" | "starting_completed_months" | "start_date" | "trial_plan" | "ended_on" | "trial_outcome" | "trial_decided_on">,
  postingDays: PostingDay[],
) {
  const t = trialStatus(postingDays, creator);
  if (t.plan === "v2") return t; // the v2 trial ends on the 20th posting day, whatever the status says
  if (creator.status === "active" || (creator.starting_completed_months ?? 0) > 0) return { ...t, isInTrial: false };
  return t;
}

const NOT_STARTED_SENTINEL = "9999-12-31";

export type DayState = "posted" | "off" | "off_requested" | "missed" | "pending";

/**
 * Per-weekday state for a month inside the creator's active window. Mirrors
 * the calculator: posted = >= VIDEOS_PER_WEEKDAY videos on BOTH platforms.
 */
export function monthDayStates(
  creator: Pick<CreatorProfile, "start_date" | "ended_on" | "timezone" | "trial_plan" | "trial_outcome" | "trial_decided_on">,
  month: YyyyMm,
  history: Pick<CreatorHistory, "postingDays" | "daysOff">,
  now: Date = new Date(),
): { date: YyyyMmDd; state: DayState; videos: number }[] {
  if (!hasStarted(creator)) return [];
  const today = creatorToday(creator, now);
  const counts = new Map<string, number>();
  for (const p of history.postingDays) counts.set(p.date, (counts.get(p.date) ?? 0) + completeVideoCount(p));
  const off = new Map(history.daysOff.map((d) => [d.date, d.status]));
  return weekdaysBetween(monthFirst(month), monthLast(month))
    .filter((d) => isScheduledDay(creator, history.postingDays, d))
    .map((date) => {
      const videos = counts.get(date) ?? 0;
      let state: DayState;
      if (videos >= videosRequiredOn(creator, history.postingDays, date)) state = "posted";
      else if (off.get(date) === "approved") state = "off";
      else if (date >= today) state = off.get(date) === "requested" ? "off_requested" : "pending";
      else state = "missed";
      return { date, state, videos };
    });
}

// ---------------------------------------------------------------- posting

function checkUrl(raw: string, platform: Platform, label = ""): string {
  const s = raw.trim();
  if (!s) return "";
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new CreatorDataError(`${label}That ${platform === "tiktok" ? "TikTok" : "Instagram"} link doesn't look like a full link. Copy it from the app's Share button.`);
  }
  const host = u.hostname.toLowerCase();
  const ok = platform === "tiktok" ? /(^|\.)tiktok\.com$/.test(host) : /(^|\.)instagram\.com$/.test(host);
  if (!/^https?:$/.test(u.protocol) || !ok) {
    throw new CreatorDataError(
      `${label}The ${platform === "tiktok" ? "TikTok" : "Instagram"} box needs ${platform === "tiktok" ? "a tiktok.com" : "an instagram.com"} link.`,
    );
  }
  return s;
}

/** Optional "Inspired by" link on a format creator's concept video: any full http(s) link, or "". */
export function checkInspiredByUrl(raw: string, label = ""): string {
  const s = raw.trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (/^https?:$/.test(u.protocol) && u.hostname.includes(".")) return s.slice(0, 1000);
  } catch {
    // fall through
  }
  throw new CreatorDataError(`${label}The "Inspired by" box needs a full link, like one copied from the app's Share button.`);
}

/**
 * Save (replace) the day's video log. Rejects future dates and saves after
 * 11:59 pm on `date` in the creator's timezone, unless `skipDeadline`
 * (admin corrections). Rows with both links empty are dropped.
 */
export async function savePostingDay(
  id: string,
  date: YyyyMmDd,
  videos: PostedVideo[],
  opts: { now?: Date; skipDeadline?: boolean } = {},
): Promise<PostingDay> {
  if (!isYyyyMmDd(date)) throw new CreatorDataError("Invalid date");
  const creator = await getCreator(id);
  if (!creator) throw new CreatorDataError("Creator not found", 404);
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  if (!opts.skipDeadline) {
    const today = creatorToday(creator, now);
    if (date > today) throw new CreatorDataError("You can only log videos for today.");
    if (!isOnTime(nowIso, date, creator.timezone)) {
      throw new CreatorDataError(
        "The deadline for this day has passed (11:59 pm your time), so it can't be changed now. If something went wrong, message your manager on Slack.",
        409,
      );
    }
  }
  if (!Array.isArray(videos)) throw new CreatorDataError("videos must be a list");
  if (videos.length > MAX_VIDEO_ROWS) throw new CreatorDataError("Too many videos in one day");
  // Remake attribution: row i remakes the day's pick in slot i (by the row's position on Today, before empty rows drop out).
  const picksSnap = await creatorRef(id).collection("daily_picks").doc(date).get();
  const pickIds: (string | undefined)[] = [];
  for (const p of (picksSnap.exists && Array.isArray(picksSnap.data()!.picks) ? picksSnap.data()!.picks : []) as { slot: number; proven_id: string }[]) {
    if (Number.isInteger(p?.slot) && p.proven_id) pickIds[p.slot] = String(p.proven_id);
  }
  // A row that already carries one of today's picks keeps it (saved rows can shift up when an earlier row is empty).
  const dayPicks = new Set(pickIds.filter(Boolean));
  const kept = new Set<string>();
  const rowPick = videos.map((v) => {
    const id = typeof v?.proven_id === "string" ? v.proven_id : "";
    if (!id || !dayPicks.has(id) || kept.has(id)) return undefined;
    kept.add(id);
    return id;
  });
  const clean: PostedVideo[] = [];
  videos.forEach((v, i) => {
    const tiktok_url = checkUrl(String(v?.tiktok_url ?? ""), "tiktok", `Video ${i + 1}: `);
    const instagram_url = checkUrl(String(v?.instagram_url ?? ""), "instagram", `Video ${i + 1}: `);
    const inspired_by_url = checkInspiredByUrl(String(v?.inspired_by_url ?? ""), `Video ${i + 1}: `);
    const byPos = pickIds[i] && !kept.has(pickIds[i]!) ? pickIds[i] : undefined;
    const proven_id = rowPick[i] ?? byPos;
    if (tiktok_url || instagram_url) {
      clean.push({ tiktok_url, instagram_url, ...(inspired_by_url ? { inspired_by_url } : {}), ...(proven_id ? { proven_id } : {}) });
    }
  });
  const dupe = (key: "tiktok_url" | "instagram_url") => {
    const seen = new Set<string>();
    for (const v of clean) {
      const k = v[key].replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
      if (!k) continue;
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  };
  if (dupe("tiktok_url") || dupe("instagram_url")) {
    throw new CreatorDataError("The same link is in there twice. Each video needs to be a different one.");
  }
  const ref = creatorRef(id).collection("posting_days").doc(date);
  const existing = await ref.get();
  // Keep the "found automatically" marks for links the post sync added that are still in the log.
  const prevAuto: string[] = existing.exists && Array.isArray(existing.data()!.auto_urls) ? existing.data()!.auto_urls.map(String) : [];
  const keyOf = (u: string, p: Platform) => postKey(u, p);
  const savedKeys = new Set(clean.flatMap((v) => [v.tiktok_url && keyOf(v.tiktok_url, "tiktok"), v.instagram_url && keyOf(v.instagram_url, "instagram")]).filter(Boolean));
  const autoUrls = prevAuto.filter((u) => savedKeys.has(keyOf(u, /tiktok\.com/i.test(u) ? "tiktok" : "instagram")));
  const doc: PostingDay & { first_logged_at: string; on_time: boolean } = {
    date,
    videos: clean,
    logged_at: nowIso,
    first_logged_at: (existing.exists && existing.data()!.first_logged_at) || nowIso,
    on_time: isOnTime(nowIso, date, creator.timezone),
    ...(autoUrls.length
      ? { auto_urls: autoUrls, source: "manual+auto" as const, ...(existing.data()!.auto_synced_at ? { auto_synced_at: existing.data()!.auto_synced_at } : {}) }
      : {}),
  };
  // The once-per-day "Day complete" marker survives a re-save (claimDayComplete).
  const celebrated = existing.exists ? existing.data()!.day_complete_at : null;
  await ref.set(celebrated ? { ...doc, day_complete_at: celebrated } : doc);
  if (clean.length && !hasStarted(creator)) await setStartDateIfUnset(id, date);
  await advanceCreatorStatus(id).catch((e) => console.error("creator status advance failed:", e));
  return { date, videos: clean, logged_at: nowIso, ...(autoUrls.length ? { auto_urls: autoUrls } : {}) };
}

/**
 * Claims the end-of-day celebration for `date`, once: true the first time
 * (stamps posting_days/{date}.day_complete_at), false after that. Both the
 * posting save and the app's "I posted it" check go through this, so the Day
 * complete screen shows once however the day got counted.
 */
export async function claimDayComplete(id: string, date: YyyyMmDd, opts: { db?: Firestore; now?: Date } = {}): Promise<boolean> {
  const db = opts.db ?? fs();
  const ref = db.collection(CREATORS_COLLECTION).doc(id).collection("posting_days").doc(date);
  const nowIso = (opts.now ?? new Date()).toISOString();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()!.day_complete_at) return false;
    tx.update(ref, { day_complete_at: nowIso });
    return true;
  });
}

/** Pure rule behind advanceCreatorStatus (exported for tests). */
export function nextAutoStatus(
  from: CreatorStatus,
  onboarded: boolean,
  postingDays: PostingDay[],
  profile?: Parameters<typeof trialStatus>[1],
): CreatorStatus {
  if (from !== "onboarding" && from !== "trial") return from;
  if (from === "onboarding" && !onboarded) return from;
  const t = trialStatus(postingDays, profile);
  if (t.ended) return "ended";
  return t.isInTrial ? "trial" : "active";
}

/**
 * Automatic status steps, never backwards and never over an admin's choice:
 *   onboarding -> trial   once every Getting started step is done
 *   trial      -> active  once the trial is over (TRIAL_POSTED_DAYS posted
 *                         weekdays, exactly as pay.ts trialStatus counts them)
 * Only moves from those two statuses (leaving / ended / anything an admin set
 * is left alone). Idempotent: safe to call after every onboarding step,
 * posting-day save and post sync. Returns the new status when it changed.
 */
export async function advanceCreatorStatus(id: string, opts: { db?: Firestore; now?: Date } = {}): Promise<CreatorStatus | null> {
  const db = opts.db ?? fs();
  const ref = db.collection(CREATORS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  const from = mapCreatorStatus(d.status);
  if (from !== "onboarding" && from !== "trial") return null;
  let onboarded = true;
  if (from === "onboarding") {
    const onb = await ref.collection("onboarding").doc("state").get();
    onboarded = onb.exists && isOnboarded(onb.data() as Partial<OnboardingState>, { contractSigned: d.contract?.status === "signed" });
    if (!onboarded) return null;
  }
  const days = await ref.collection("posting_days").get();
  const profile = isYyyyMmDd(d.start_date)
    ? {
        start_date: d.start_date as YyyyMmDd,
        ...(d.trial_plan === "v2" ? { trial_plan: "v2" as const } : {}),
        ...(isYyyyMmDd(d.ended_on) ? { ended_on: d.ended_on as YyyyMmDd } : {}),
        ...(d.trial_outcome === "keep" || d.trial_outcome === "end" ? { trial_outcome: d.trial_outcome as "keep" | "end" } : {}),
        ...(isYyyyMmDd(d.trial_decided_on) ? { trial_decided_on: d.trial_decided_on as YyyyMmDd } : {}),
      }
    : undefined;
  const postingDays = days.docs.map((x) => toPostingDay(x.id, x.data()));
  // The 20th trial day just counted: remember it (nudges stop; the founder is asked to decide).
  const tw = trialWindow(profile, postingDays);
  if (tw?.completedOn && !isYyyyMmDd(d.trial_completed_on)) await ref.update({ trial_completed_on: tw.completedOn });
  const to = nextAutoStatus(from, onboarded, postingDays, profile);
  if (to === from) return null;
  const nowIso = (opts.now ?? new Date()).toISOString();
  const changed = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (!cur.exists || cur.data()!.status !== d.status) return false; // someone else changed it meanwhile
    tx.update(ref, { status: to, status_changed_at: nowIso, status_auto: { from, to, at: nowIso } });
    return true;
  });
  return changed ? to : null;
}

/** Pay starts on the first posting day: set start_date once, only if still unset. */
async function setStartDateIfUnset(id: string, date: YyyyMmDd): Promise<void> {
  const ref = creatorRef(id);
  await fs().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || isYyyyMmDd(snap.data()!.start_date)) return;
    tx.update(ref, { start_date: date, start_date_source: "first_post", start_date_set_at: new Date().toISOString() });
  });
}

// ---------------------------------------------------------------- days off

export async function requestDayOff(
  id: string,
  date: YyyyMmDd,
  opts: { reason?: string; now?: Date } = {},
): Promise<DayOff> {
  if (!isYyyyMmDd(date)) throw new CreatorDataError("Pick a valid date");
  if (!isWeekday(date)) throw new CreatorDataError("Weekends are already off. Pick a weekday.");
  const creator = await getCreator(id);
  if (!creator) throw new CreatorDataError("Creator not found", 404);
  const now = opts.now ?? new Date();
  if (date < creatorToday(creator, now)) throw new CreatorDataError("That day has already passed.");
  const ref = creatorRef(id).collection("days_off").doc(date);
  const existing = await ref.get();
  if (existing.exists && existing.data()!.status !== "requested") {
    throw new CreatorDataError(`That day was already ${existing.data()!.status}.`, 409);
  }
  const doc: DayOff = {
    date,
    status: "requested",
    requested_at: now.toISOString(),
    ...(opts.reason?.trim() ? { reason: opts.reason.trim().slice(0, 500) } : {}),
  };
  await ref.set(doc);
  return doc;
}

/** Admin: approve / decline (or reset to requested). */
export async function setDayOffStatus(id: string, date: YyyyMmDd, status: DayOff["status"]): Promise<void> {
  if (!["requested", "approved", "declined"].includes(status)) throw new CreatorDataError("Unknown status");
  const ref = creatorRef(id).collection("days_off").doc(date);
  const snap = await ref.get();
  await ref.set(
    {
      date,
      status,
      decided_at: new Date().toISOString(),
      ...(snap.exists ? {} : { requested_at: new Date().toISOString() }),
    },
    { merge: true },
  );
}

// ---------------------------------------------------------------- bonuses

export interface BonusClaimInput {
  video_url: string;
  platform: Platform;
  posted_on: YyyyMmDd;
  views_claimed: number;
  screenshot_path?: string;
}

export async function addBonusClaim(
  id: string,
  input: BonusClaimInput,
  opts: { now?: Date } = {},
): Promise<WithId<BonusClaim>> {
  const creator = await getCreator(id);
  if (!creator) throw new CreatorDataError("Creator not found", 404);
  if (input.platform !== "tiktok" && input.platform !== "instagram") throw new CreatorDataError("Pick TikTok or Instagram");
  const video_url = checkUrl(String(input.video_url ?? ""), input.platform);
  if (!video_url) throw new CreatorDataError("Paste the video link");
  if (!isYyyyMmDd(input.posted_on)) throw new CreatorDataError("Pick the date the video was posted");
  const now = opts.now ?? new Date();
  if (input.posted_on > creatorToday(creator, now)) throw new CreatorDataError("The posted date can't be in the future");
  const views = Math.floor(Number(input.views_claimed));
  if (!Number.isFinite(views) || views < 0) throw new CreatorDataError("Enter the view count as a number");
  if (input.screenshot_path && !input.screenshot_path.startsWith(`creators/${id}/bonus/`)) {
    throw new CreatorDataError("Invalid screenshot");
  }
  const col = creatorRef(id).collection("bonus_claims");
  const pending = await col.where("video_url", "==", video_url).get();
  if (pending.docs.some((d) => d.data().platform === input.platform && d.data().status === "claimed")) {
    throw new CreatorDataError("You already have a claim waiting for this video. We'll review it soon.", 409);
  }
  const doc: BonusClaim = {
    video_url,
    platform: input.platform,
    posted_on: input.posted_on,
    views_claimed: views,
    status: "claimed",
    claimed_at: now.toISOString(),
    ...(input.screenshot_path ? { screenshot_path: input.screenshot_path } : {}),
  };
  const ref = await col.add(doc);
  return { ...doc, id: ref.id };
}

/** Admin: approve/reject a claim and record the crossing dates the calculator uses. */
export async function reviewBonusClaim(
  id: string,
  claimId: string,
  patch: Partial<Pick<BonusClaim, "status" | "crossed_100k_on" | "crossed_1m_on" | "admin_note" | "posted_on">>,
): Promise<void> {
  const out: Record<string, unknown> = { reviewed_at: new Date().toISOString() };
  if (patch.status !== undefined) {
    if (!["claimed", "approved", "rejected"].includes(patch.status)) throw new CreatorDataError("Unknown status");
    out.status = patch.status;
  }
  for (const k of ["crossed_100k_on", "crossed_1m_on", "posted_on"] as const) {
    if (patch[k] === undefined) continue;
    if (patch[k] && !isYyyyMmDd(patch[k])) throw new CreatorDataError(`${k} must be yyyy-mm-dd`);
    out[k] = patch[k] || null;
  }
  if (patch.admin_note !== undefined) out.admin_note = patch.admin_note;
  await creatorRef(id).collection("bonus_claims").doc(claimId).update(out);
}

// ---------------------------------------------------------------- adjustments

export async function addAdjustment(
  id: string,
  input: { month: YyyyMm; amount_cents: number; note: string },
): Promise<WithId<Adjustment>> {
  if (!isYyyyMm(input.month)) throw new CreatorDataError("month must be yyyy-mm");
  const amount = Math.round(Number(input.amount_cents));
  if (!Number.isFinite(amount) || amount === 0) throw new CreatorDataError("Amount must be a non-zero number of cents");
  await assertMonthOpen(id, input.month);
  const doc: Adjustment = { month: input.month, amount_cents: amount, note: String(input.note ?? "").trim(), created_at: new Date().toISOString() };
  const ref = await creatorRef(id).collection("adjustments").add(doc);
  return { ...doc, id: ref.id };
}

export async function deleteAdjustment(id: string, adjustmentId: string): Promise<void> {
  const ref = creatorRef(id).collection("adjustments").doc(adjustmentId);
  const snap = await ref.get();
  if (!snap.exists) return;
  await assertMonthOpen(id, snap.data()!.month);
  await ref.delete();
}

async function assertMonthOpen(id: string, month: YyyyMm) {
  const inv = await creatorRef(id).collection("invoices").where("month", "==", month).get();
  if (inv.docs.some((d) => d.data().locked === true || d.data().status === "paid")) {
    throw new CreatorDataError("That month's invoice is already paid and locked.", 409);
  }
}

// ---------------------------------------------------------------- onboarding

function onboardingRef(id: string) {
  return creatorRef(id).collection("onboarding").doc("state");
}

/** Getting started steps in portal order. Shared by the portal and admin progress counts. */
// Portal order. Warm-up is last: it runs over the 3 days after everything else is done.
export const ONBOARDING_STEP_KEYS: OnboardingStepKey[] = ["contract", "slack", "videos", "quiz", "accounts", "link", "rules", "warmup"];
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEP_KEYS.length;

export interface OnboardingCheckOpts {
  /** The creator doc says contract.status === "signed" (covers contracts marked signed by admin). */
  contractSigned?: boolean;
}

/** Done / not done per step. Works on raw Firestore data too (fields are read defensively). */
export function onboardingSteps(s: Partial<OnboardingState> | null | undefined, opts: OnboardingCheckOpts = {}): Record<OnboardingStepKey, boolean> {
  const st = s ?? {};
  return {
    contract: !!st.contract_signed_at || !!opts.contractSigned,
    videos: FOUNDER_VIDEOS.every((v) => !!st.videos_watched?.[v.id]),
    quiz: !!st.quiz_passed_at,
    accounts: !!st.accounts_done_at,
    slack: !!st.slack_joined_at,
    warmup: (Array.isArray(st.warmup_days) ? st.warmup_days.length : 0) >= WARMUP_DAYS,
    rules: !!st.rules_ack_at,
    link: !!st.link_seen_at,
  };
}

/** { done, total } over ONBOARDING_STEP_KEYS. A stored completed_at counts as all done. */
export function onboardingProgress(s: Partial<OnboardingState> | null | undefined, opts: OnboardingCheckOpts = {}): { done: number; total: number } {
  if (s?.completed_at) return { done: ONBOARDING_STEP_COUNT, total: ONBOARDING_STEP_COUNT };
  const steps = onboardingSteps(s, opts);
  return { done: ONBOARDING_STEP_KEYS.filter((k) => steps[k]).length, total: ONBOARDING_STEP_COUNT };
}

export function isOnboardingComplete(s: Partial<OnboardingState> | null | undefined, opts: OnboardingCheckOpts = {}): boolean {
  const steps = onboardingSteps(s, opts);
  return ONBOARDING_STEP_KEYS.every((k) => steps[k]);
}

/** True once the creator may use the full portal (posting, bonuses, days off). */
export function isOnboarded(s: Partial<OnboardingState> | null | undefined, opts: OnboardingCheckOpts = {}): boolean {
  return !!s?.completed_at || isOnboardingComplete(s, opts);
}

/** Server-side gate for posting / bonus / days-off writes. */
export async function assertOnboarded(creator: Pick<CreatorProfile, "id" | "contract">): Promise<void> {
  const s = await getOnboarding(creator.id);
  if (!isOnboarded(s, { contractSigned: creator.contract.status === "signed" })) {
    throw new CreatorDataError("Finish the Getting started steps first. Your full portal opens up once they're all done.", 409);
  }
}

/** Marks the contract step done (called after e-signing or when admin marks a contract signed). */
export async function markContractStepDone(id: string, at: string = new Date().toISOString()): Promise<OnboardingState> {
  const state = await getOnboarding(id);
  if (!state.contract_signed_at) state.contract_signed_at = at;
  if (!state.completed_at && isOnboardingComplete(state)) {
    state.completed_at = at;
    state.ready_at = at;
  }
  await onboardingRef(id).set(state);
  if (state.completed_at) await advanceCreatorStatus(id).catch((e) => console.error("creator status advance failed:", e));
  return state;
}

export async function getOnboarding(id: string): Promise<OnboardingState> {
  const snap = await onboardingRef(id).get();
  const d = snap.exists ? snap.data()! : {};
  return {
    ...(d as OnboardingState),
    videos_watched: (d.videos_watched as Record<string, string>) ?? {},
    warmup_days: Array.isArray(d.warmup_days) ? d.warmup_days : [],
  };
}

export interface OnboardingStepPayload {
  tiktok_handle?: string;
  instagram_handle?: string;
  video_id?: string;
  /** quiz: chosen option index per QUIZ question, in order. */
  answers?: number[];
}

export interface OnboardingStepResult {
  state: OnboardingState;
  /** quiz only. */
  quiz?: { passed: boolean; correct: number; total: number };
}

export async function setOnboardingStep(
  id: string,
  step: OnboardingStep,
  payload: OnboardingStepPayload = {},
  opts: { now?: Date } = {},
): Promise<OnboardingStepResult> {
  const nowDate = opts.now ?? new Date();
  const now = nowDate.toISOString();
  const [state, creator] = await Promise.all([getOnboarding(id), getCreator(id)]);
  if (!creator) throw new CreatorDataError("Creator not found", 404);
  const contractSigned = !!state.contract_signed_at || creator.contract.status === "signed";
  if (!contractSigned) throw new CreatorDataError("Sign your contract first. The other steps open up after that.", 409);
  if (!state.contract_signed_at) state.contract_signed_at = creator.contract.signed_at || now;
  let quiz: OnboardingStepResult["quiz"];
  switch (step) {
    case "videos": {
      if (!FOUNDER_VIDEOS.some((v) => v.id === payload.video_id)) throw new CreatorDataError("Unknown video");
      state.videos_watched = { ...state.videos_watched, [payload.video_id!]: now };
      break;
    }
    case "quiz": {
      if (!FOUNDER_VIDEOS.every((v) => !!state.videos_watched?.[v.id])) {
        throw new CreatorDataError("Watch both videos first.");
      }
      const answers = Array.isArray(payload.answers) ? payload.answers : [];
      const correct = QUIZ.filter((q, i) => Number(answers[i]) === q.correct).length;
      const passed = correct === QUIZ.length;
      state.quiz_attempts = (state.quiz_attempts ?? 0) + 1;
      if (passed && !state.quiz_passed_at) state.quiz_passed_at = now;
      quiz = { passed, correct, total: QUIZ.length };
      break;
    }
    case "accounts": {
      const tt = normalizeHandle(payload.tiktok_handle ?? "");
      const ig = normalizeHandle(payload.instagram_handle ?? "");
      if (!tt || !ig) throw new CreatorDataError("Add both your TikTok and Instagram handles");
      // Catch typos now rather than as a missed day later. null = couldn't
      // check (outage, no key): save anyway.
      const [ttOk, igOk] = await Promise.all([handleExists("tiktok", tt), handleExists("instagram", ig)]);
      const missing = [ttOk === false ? `@${tt} on TikTok` : "", igOk === false ? `@${ig} on Instagram` : ""].filter(Boolean);
      if (missing.length) {
        throw new CreatorDataError(
          `We couldn't find ${missing.join(" or ")}. Check the spelling, and make sure you've finished creating the account.`,
        );
      }
      await creatorRef(id).update({ tiktok_handle: tt, instagram_handle: ig });
      state.accounts_done_at = now;
      break;
    }
    case "slack":
      state.slack_joined_at = now;
      break;
    case "warmup": {
      // Warm-up uses the new accounts, so they (and the bio and link) must exist first.
      if (!state.accounts_done_at || !state.link_seen_at) {
        throw new CreatorDataError("Set up your accounts and add your bio and link first. The warm-up starts after that.", 409);
      }
      const today = creatorToday(creator, nowDate);
      const days = state.warmup_days ?? [];
      if (days.includes(today)) throw new CreatorDataError("You've already ticked today. Come back tomorrow for the next one.", 409);
      if (days.length >= WARMUP_DAYS) throw new CreatorDataError("Warm-up is already done.", 409);
      state.warmup_days = [...days, today].sort();
      break;
    }
    case "rules":
      state.rules_ack_at = now;
      break;
    case "link":
      if (!creator.tracking_url) throw new CreatorDataError("Your link is still being set up. You can tick this once it shows here.", 409);
      state.link_seen_at = now;
      break;
    default:
      throw new CreatorDataError("Unknown step");
  }
  if (!state.completed_at && isOnboardingComplete(state)) {
    state.completed_at = now;
    state.ready_at = now;
  }
  await onboardingRef(id).set(state);
  if (state.completed_at) await advanceCreatorStatus(id).catch((e) => console.error("creator status advance failed:", e));
  return { state, ...(quiz ? { quiz } : {}) };
}

// ---------------------------------------------------------------- invoices

function invoicesCol(id: string) {
  return creatorRef(id).collection("invoices");
}

export async function listInvoices(id: string): Promise<Invoice[]> {
  const snap = await invoicesCol(id).get();
  return snap.docs.map((d) => toInvoice(d.id, d.data())).sort((a, b) => b.month.localeCompare(a.month));
}

export async function getInvoice(id: string, number: string): Promise<Invoice | null> {
  const snap = await invoicesCol(id).doc(number).get();
  return snap.exists ? toInvoice(snap.id, snap.data()!) : null;
}

function servicePeriod(creator: CreatorProfile, month: YyyyMm): { period_start: YyyyMmDd; period_end: YyyyMmDd } {
  const first = monthFirst(month);
  const last = monthLast(month);
  const start = creator.start_date > first ? creator.start_date : first;
  const end = creator.ended_on && creator.ended_on < last ? creator.ended_on : last;
  return { period_start: start, period_end: end };
}

/**
 * The month's invoice. A non-draft invoice is returned untouched; a draft is
 * recalculated from current data; if none exists one is created, numbered
 * with the creator's prefix + next sequence (ContentCreators.invoice_seq).
 */
export async function draftOrGetInvoice(id: string, month: YyyyMm, opts: { now?: Date } = {}): Promise<Invoice> {
  if (!isYyyyMm(month)) throw new CreatorDataError("month must be yyyy-mm");
  const creator = await getCreator(id);
  if (!creator) throw new CreatorDataError("Creator not found", 404);
  if (!hasStarted(creator)) throw new CreatorDataError("Pay hasn't started yet. It starts on the first posting day.", 409);
  const history = await getHistory(id);
  const existing = history.invoices.find((i) => i.month === month);
  if (existing && existing.status !== "draft") return existing;

  const { lines } = await getMonthOverview(creator, month, { now: opts.now, history });
  const total_cents = lines.reduce((s, l) => s + l.amount_cents, 0);
  const nowIso = (opts.now ?? new Date()).toISOString();
  const period = servicePeriod(creator, month);

  if (existing) {
    const upd = { lines, total_cents, ...period, updated_at: nowIso };
    await invoicesCol(id).doc(existing.number).update(upd);
    return { ...existing, ...upd };
  }

  const db = fs();
  // Two requests can draft the same month at once (the Invoices tab loading
  // twice, two devices). The transaction makes only one of them create the
  // invoice; if ours loses the race and Firestore gives up on it, return the
  // invoice the other request created instead of failing the page.
  try {
    return await createDraftInvoice(db, id, month, lines, total_cents, period, nowIso);
  } catch (e) {
    const winner = (await invoicesCol(id).where("month", "==", month).limit(1).get()).docs[0];
    if (winner) return toInvoice(winner.id, winner.data());
    throw e;
  }
}

async function createDraftInvoice(
  db: Firestore,
  id: string,
  month: YyyyMm,
  lines: InvoiceLine[],
  total_cents: number,
  period: { period_start: YyyyMmDd; period_end: YyyyMmDd },
  nowIso: string,
): Promise<Invoice> {
  return db.runTransaction(async (tx) => {
    const cSnap = await tx.get(creatorRef(id));
    const cData = requireCreatorData(cSnap);
    const race = await tx.get(invoicesCol(id).where("month", "==", month).limit(1));
    if (!race.empty) return toInvoice(race.docs[0].id, race.docs[0].data());
    const seq = Number(cData.invoice_seq ?? 0) + 1;
    // Initials alone collide (two "J S" creators), so the prefix also carries
    // part of the creator's doc id. Fixed on first invoice and reused after.
    const prefix =
      (typeof cData.invoice_prefix === "string" && cData.invoice_prefix) ||
      `${creatorPrefix(cData.legal_name || cData.name || "") || "KC"}${id.slice(0, 4).toUpperCase()}`;
    const number = invoiceNumber(prefix, seq);
    const inv: Invoice = {
      number,
      month,
      lines,
      total_cents,
      status: "draft",
      locked: false,
      ...period,
      created_at: nowIso,
      updated_at: nowIso,
    };
    tx.set(invoicesCol(id).doc(number), inv);
    tx.update(creatorRef(id), { invoice_seq: seq, invoice_prefix: prefix });
    return inv;
  });
}

async function transitionInvoice(
  id: string,
  number: string,
  from: InvoiceStatus[],
  to: InvoiceStatus,
  extra: Record<string, unknown> = {},
): Promise<Invoice> {
  const ref = invoicesCol(id).doc(number);
  return fs().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CreatorDataError("Invoice not found", 404);
    const inv = toInvoice(snap.id, snap.data()!);
    if (inv.locked) throw new CreatorDataError("This invoice is paid and locked.", 409);
    if (!from.includes(inv.status)) throw new CreatorDataError(`Invoice is ${inv.status}.`, 409);
    const upd = { status: to, updated_at: new Date().toISOString(), ...extra };
    tx.update(ref, upd);
    return { ...inv, ...upd } as Invoice;
  });
}

/** Creator confirms their draft. Recalculates once more, then snapshots and submits. */
export async function submitInvoice(id: string, number: string, opts: { now?: Date } = {}): Promise<Invoice> {
  const inv = await getInvoice(id, number);
  if (!inv) throw new CreatorDataError("Invoice not found", 404);
  if (inv.status !== "draft") throw new CreatorDataError(`This invoice was already ${inv.status}.`, 409);
  const fresh = await draftOrGetInvoice(id, inv.month, opts);
  const creator = await getCreator(id);
  return transitionInvoice(id, number, ["draft"], "submitted", {
    submitted_at: (opts.now ?? new Date()).toISOString(),
    creator_legal_name: creator?.legal_name || creator?.name || "",
    lines: fresh.lines,
    total_cents: fresh.total_cents,
  });
}

/**
 * Self-billing cron: submit a draft on the creator's behalf, opening the
 * dispute window (lib/creators/invoice-auto.ts). Recalculates first. Returns
 * null (and writes nothing) if it's no longer a draft, so reruns never resubmit.
 */
export async function autoSubmitInvoice(id: string, number: string, opts: { now?: Date } = {}): Promise<Invoice | null> {
  const now = opts.now ?? new Date();
  const inv = await getInvoice(id, number);
  if (!inv || inv.status !== "draft") return null;
  const fresh = await draftOrGetInvoice(id, inv.month, { now });
  const creator = await getCreator(id);
  const ref = invoicesCol(id).doc(number);
  return fs().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const cur = toInvoice(snap.id, snap.data()!);
    if (cur.locked || cur.status !== "draft") return null;
    const upd = {
      status: "submitted" as const,
      ...autoSubmitFields(now),
      disputed_at: null,
      dispute_note: null,
      dispute_resolved_at: null,
      creator_legal_name: creator?.legal_name || creator?.name || "",
      lines: fresh.lines,
      total_cents: fresh.total_cents,
      updated_at: now.toISOString(),
    };
    tx.update(ref, upd);
    return { ...cur, ...upd };
  });
}

/** Creator "Something's off?": flags a submitted invoice while its dispute window is open. */
export async function disputeInvoice(id: string, number: string, note: unknown, opts: { now?: Date } = {}): Promise<Invoice> {
  const ref = invoicesCol(id).doc(number);
  return fs().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CreatorDataError("Invoice not found", 404);
    const inv = toInvoice(snap.id, snap.data()!);
    let upd;
    try {
      upd = disputeUpdate(inv, note, opts.now);
    } catch (e) {
      if (e instanceof InvoiceRuleError) throw new CreatorDataError(e.message, e.status);
      throw e;
    }
    tx.update(ref, upd);
    return { ...inv, ...upd };
  });
}

/** Admin: approve a submitted invoice. */
export async function approveInvoice(id: string, number: string): Promise<Invoice> {
  return transitionInvoice(id, number, ["submitted"], "approved", { approved_at: new Date().toISOString() });
}

/** Admin: send a submitted/approved invoice back to draft so it recalculates (e.g. after a fix). */
export async function returnInvoiceToDraft(id: string, number: string): Promise<Invoice> {
  // Clears the self-billing window too: the next auto-submit restarts it.
  return transitionInvoice(id, number, ["submitted", "approved"], "draft", {
    submitted_at: null,
    approved_at: null,
    auto_submitted: false,
    dispute_until: null,
  });
}

/** Admin: mark paid. Locks the invoice permanently. */
export async function markInvoicePaid(
  id: string,
  number: string,
  input: { paid_at?: string; payment_reference?: string; payment_proof_path?: string } = {},
): Promise<Invoice> {
  return transitionInvoice(id, number, ["submitted", "approved"], "paid", {
    paid_at: input.paid_at || new Date().toISOString(),
    ...(input.payment_reference ? { payment_reference: input.payment_reference } : {}),
    ...(input.payment_proof_path ? { payment_proof_path: input.payment_proof_path } : {}),
    locked: true,
  });
}

// ---------------------------------------------------------------- portal settings

const PORTAL_SETTINGS_DOC = "creator_portal";

/** Settings/creator_portal. slack_invite_url falls back to env SLACK_INVITE_URL. */
export async function getPortalSettings(): Promise<{ slack_invite_url: string | null; slack_invite_url_stored: string }> {
  const snap = await fs().collection("Settings").doc(PORTAL_SETTINGS_DOC).get();
  const stored = snap.exists && typeof snap.data()!.slack_invite_url === "string" ? snap.data()!.slack_invite_url.trim() : "";
  return { slack_invite_url: stored || process.env.SLACK_INVITE_URL || null, slack_invite_url_stored: stored };
}

export async function savePortalSettings(patch: { slack_invite_url?: string }): Promise<void> {
  const out: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.slack_invite_url !== undefined) {
    const v = normalizeTrackingUrl(patch.slack_invite_url);
    if (v === null) throw new CreatorDataError("Slack invite link must be a full https:// link");
    out.slack_invite_url = v;
  }
  await fs().collection("Settings").doc(PORTAL_SETTINGS_DOC).set(out, { merge: true });
}

// ---------------------------------------------------------------- storage

function bucket() {
  return getStorage(getFirebaseAdmin().app).bucket(STORAGE_BUCKET);
}

/** Short-lived signed GET URL for any object path (contract PDF, screenshot, proof). */
export async function signedReadUrl(path: string, minutes = 10): Promise<string> {
  const [url] = await bucket().file(path).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + minutes * 60000 });
  return url;
}

/** Signed PUT URL for a bonus screenshot, stored under creators/<id>/bonus/. */
export async function bonusScreenshotUploadUrl(
  id: string,
  input: { filename?: string; contentType?: string; sizeBytes?: number },
): Promise<{ uploadUrl: string; objectPath: string }> {
  const contentType = input.contentType ?? "image/jpeg";
  if (!/^image\/(png|jpeg|jpg|webp|heic|heif)$/.test(contentType)) throw new CreatorDataError("Upload a PNG, JPG, WebP or HEIC image.");
  if ((input.sizeBytes ?? 0) > 15 * 1024 * 1024) throw new CreatorDataError("Image is over 15MB.");
  const filename = (input.filename ?? "screenshot").replace(/[^\w.\-]/g, "_").slice(-80);
  const uploadId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const objectPath = `creators/${id}/bonus/${uploadId}/${filename}`;
  const [uploadUrl] = await bucket().file(objectPath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60000,
    contentType,
  });
  return { uploadUrl, objectPath };
}
