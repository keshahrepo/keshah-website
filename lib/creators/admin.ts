/**
 * Admin-side server helpers for the creator pay system (dashboard section
 * /dashboard/creators-pay, API under /api/admin/creators).
 *
 * Source of truth is the `ContentCreators` collection (the existing creator
 * login collection). Pay/profile fields live on those docs; per-creator data
 * lives in subcollections:
 *   ContentCreators/{id}/posting_days/{yyyy-mm-dd}   { videos: [{tiktok_url, instagram_url}], logged_at }
 *   ContentCreators/{id}/days_off/{yyyy-mm-dd}       { status: requested|approved|declined }
 *   ContentCreators/{id}/bonus_claims/{auto}         BonusClaim
 *   ContentCreators/{id}/adjustments/{auto}          Adjustment
 *   ContentCreators/{id}/invoices/{number}           Invoice (locked once paid)
 *   ContentCreators/{id}/onboarding/{doc}            onboarding progress
 *
 * The loaders here are admin-specific (raw status kept for editing, raw
 * posting docs for the calendar), but onboarding progress, status display
 * mapping and URL validation come from lib/creators/db.ts so portal and admin
 * always agree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";
import { mapCreatorStatus, normalizeTrackingUrl, onboardingProgress as sharedOnboardingProgress } from "./db";
import {
  addMonths,
  baseForCompletedMonths,
  completedMonthsAsOf,
  monthSummary,
  nextLevel,
  weekdaysBetween,
  VIDEOS_PER_WEEKDAY,
  type MonthSummary,
} from "./pay";
import { acceptCreator, acceptOf, type AcceptOptions, type AcceptResult } from "./accept";
import { candidateAddresses } from "./google-groups";
import type {
  AcceptRecord,
  Adjustment,
  BonusClaim,
  CreatorContract,
  DayOff,
  Invoice,
  PayProfile,
  PostingDay,
  PostSyncState,
  YyyyMm,
  YyyyMmDd,
} from "./types";

export const CREATORS_COLLECTION = "ContentCreators";

// ------------------------------------------------------------------ proceeds
// Proceeds come from the user's FIRST paid charge only (first_proceeds_usd,
// falling back to proceeds_usd_total): real RevenueCat store proceeds after
// Apple/Google's cut. Renewals are deliberately not credited to creators. A converted user with
// no recorded proceeds yet is filled in at the creator's own average, or this
// fallback when the creator has none recorded at all.
export const FALLBACK_PROCEEDS_PER_PURCHASE_USD = 70;
export const ROI_GREEN = 1.5;
export const ROI_AMBER = 0.75;

export const PAYMENT_METHOD_LABEL = "Amex ACH";
export const CREATOR_STATUSES = ["onboarding", "trial", "active", "leaving", "ended"];

// ------------------------------------------------------------------ auth

/** Returns a 403 response unless the request carries an admin dashboard cookie. */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const payload = token ? await getPayloadFromToken(token) : null;
  if (!payload || payload.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return null;
}

export function db(): Firestore {
  return getFirebaseAdmin().db;
}

// ------------------------------------------------------------------ storage

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "keshah-app.appspot.com";

export function bucket() {
  const { app } = getFirebaseAdmin();
  return getStorage(app).bucket(BUCKET);
}

export async function signedUploadUrl(path: string, contentType: string): Promise<string> {
  const [url] = await bucket().file(path).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });
  return url;
}

export async function signedReadUrl(path: string, minutes = 15): Promise<string> {
  const [url] = await bucket().file(path).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + minutes * 60 * 1000,
  });
  return url;
}

export function safeFilename(name: string): string {
  return (name || "file").replace(/[^\w.\-]/g, "_").slice(0, 120);
}

// ------------------------------------------------------------------ dates

export function todayIn(timezone: string | undefined): YyyyMmDd {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const isMonth = (s: unknown): s is YyyyMm => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
export const isDate = (s: unknown): s is YyyyMmDd =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Firestore Timestamp / Date / ISO string → ISO string (or null). */
export function toIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  const t = v as { toDate?: () => Date; _seconds?: number };
  if (typeof t.toDate === "function") return t.toDate().toISOString();
  if (typeof t._seconds === "number") return new Date(t._seconds * 1000).toISOString();
  return null;
}

function toMs(v: unknown): number | null {
  const iso = toIso(v);
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Deep-convert Firestore values to JSON-safe plain values. */
export function plain(v: unknown): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "object") {
    const ts = v as { toDate?: () => Date };
    if (typeof ts.toDate === "function") return ts.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = plain(val);
    return out;
  }
  return v;
}

// ------------------------------------------------------------------ creator

export interface AdminCreator {
  id: string;
  name: string;
  legal_name: string;
  email: string;
  keshah_email: string;
  timezone: string;
  start_date: string;
  starting_completed_months: number;
  campaign_tags: string[];
  /** Raw ContentCreators.status (kept for the editor). */
  status: string;
  /** mapCreatorStatus(status): what to display / filter on. */
  status_display: string;
  ended_on: string | null;
  contract: CreatorContract;
  w9_on_file: boolean;
  /** Invite-only format creator (2 own concepts a day). */
  format_creator: boolean;
  creator_link_id: string;
  tracking_url: string;
  tiktok_handle: string;
  instagram_handle: string;
  is_active: boolean;
  /** Has the minimum pay setup (start_date) for the calculator. */
  pay_ready: boolean;
  /** "Accept creator" step log. */
  accept: AcceptRecord;
  accepted_at: string | null;
  /** Set-password invite (never the token hash). */
  invite: { created_at: string; expires_at: string; used_at: string | null } | null;
  has_password: boolean;
  /** What the group step would try first when keshah_email is blank. */
  suggested_keshah_email: string;
  /** Automatic post sync health (lib/creators/post-sync.ts), null before the first run. */
  post_sync: PostSyncState | null;
}

export function toAdminCreator(id: string, d: DocumentData): AdminCreator {
  const contract = (plain(d.contract ?? {}) ?? {}) as Partial<CreatorContract>;
  return {
    id,
    name: String(d.name ?? d.legal_name ?? ""),
    legal_name: String(d.legal_name ?? ""),
    email: String(d.email ?? ""),
    keshah_email: String(d.keshah_email ?? ""),
    timezone: String(d.timezone ?? ""),
    start_date: isDate(d.start_date) ? d.start_date : "",
    starting_completed_months: Number(d.starting_completed_months ?? 0) || 0,
    campaign_tags: Array.isArray(d.campaign_tags) ? d.campaign_tags.map(String) : [],
    status: String(d.status ?? ""),
    status_display: mapCreatorStatus(d.status),
    ended_on: isDate(d.ended_on) ? d.ended_on : null,
    contract: { ...contract, status: contract.status ?? "none" } as CreatorContract,
    w9_on_file: !!d.w9_on_file,
    format_creator: d.format_creator === true,
    creator_link_id: String(d.creator_link_id ?? ""),
    tracking_url: String(d.tracking_url ?? ""),
    tiktok_handle: String(d.tiktok_handle ?? ""),
    instagram_handle: String(d.instagram_handle ?? ""),
    is_active: d.is_active !== false,
    pay_ready: isDate(d.start_date),
    accept: (() => {
      const a = acceptOf({ accept: plain(d.accept) });
      delete a.running_until;
      return a;
    })(),
    accepted_at: toIso(d.accepted_at),
    invite:
      d.invite && typeof d.invite === "object"
        ? {
            created_at: String(d.invite.created_at ?? ""),
            expires_at: String(d.invite.expires_at ?? ""),
            used_at: d.invite.used_at ? String(d.invite.used_at) : null,
          }
        : null,
    has_password: !!d.password_hash,
    suggested_keshah_email: candidateAddresses(String(d.legal_name || d.name || ""))[0] ?? "",
    post_sync: d.post_sync && typeof d.post_sync === "object" ? (plain(d.post_sync) as PostSyncState) : null,
  };
}

export function payProfileOf(c: AdminCreator): PayProfile {
  return {
    start_date: c.start_date,
    starting_completed_months: c.starting_completed_months,
    ...(c.ended_on ? { ended_on: c.ended_on } : {}),
    legal_name: c.legal_name,
    timezone: c.timezone || "UTC",
  };
}

// ------------------------------------------------------------------ history

export type WithId<T> = T & { id: string };

export interface CreatorHistory {
  postingDays: PostingDay[];
  /** Raw posting docs (for the calendar / links). */
  postingRaw: { date: string; videos: Record<string, unknown>[]; complete: number; logged_at: string | null }[];
  daysOff: WithId<DayOff>[];
  bonusClaims: WithId<BonusClaim>[];
  adjustments: WithId<Adjustment>[];
  invoices: Invoice[];
  onboarding: { done: number; total: number; raw: Record<string, unknown> | null };
}

/**
 * Count of complete, unique videos in a posting doc. The agreed shape is
 * videos: [{tiktok_url, instagram_url}] — one entry per video, posted on
 * BOTH platforms. An entry counts only when both URLs are present. Legacy
 * {platform, url} entries count as-is.
 */
function completeVideos(videos: unknown): Record<string, unknown>[] {
  if (!Array.isArray(videos)) return [];
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const raw of videos) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    let key: string | null = null;
    if ("tiktok_url" in v || "instagram_url" in v) {
      const tt = String(v.tiktok_url ?? "").trim();
      const ig = String(v.instagram_url ?? "").trim();
      if (tt && ig) key = `${tt}|${ig}`;
    } else if (typeof v.url === "string" && v.url.trim()) {
      key = `${v.platform ?? ""}|${v.url.trim()}`;
    }
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

/** Progress over the portal's Getting started steps (shared step list in db.ts). */
function onboardingProgress(state: DocumentData | null, contractSigned: boolean): CreatorHistory["onboarding"] {
  const { done, total } = sharedOnboardingProgress(state, { contractSigned });
  return { done, total, raw: state ? (plain(state) as Record<string, unknown>) : null };
}

export async function loadHistory(creatorId: string, opts: { contractSigned?: boolean } = {}): Promise<CreatorHistory> {
  const ref = db().collection(CREATORS_COLLECTION).doc(creatorId);
  const [posting, off, claims, adj, inv, onb] = await Promise.all([
    ref.collection("posting_days").get(),
    ref.collection("days_off").get(),
    ref.collection("bonus_claims").get(),
    ref.collection("adjustments").get(),
    ref.collection("invoices").get(),
    ref.collection("onboarding").doc("state").get(),
  ]);

  const postingRaw = posting.docs.map((doc) => {
    const d = doc.data();
    const date = isDate(d.date) ? d.date : doc.id;
    const complete = completeVideos(d.videos);
    return {
      date,
      videos: (Array.isArray(d.videos) ? d.videos : []).map((v: unknown) => plain(v) as Record<string, unknown>),
      complete: complete.length,
      logged_at: toIso(d.logged_at),
      _complete: complete,
    };
  });
  // Videos passed to pay.ts are the complete, de-duplicated entries in their
  // stored shape, so its videos.length >= VIDEOS_PER_WEEKDAY check means
  // "5 unique videos on both platforms".
  const postingDays = postingRaw.map(
    (p) => ({ date: p.date, videos: p._complete, logged_at: p.logged_at ?? "" }) as unknown as PostingDay,
  );

  const daysOff = off.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      date: isDate(d.date) ? d.date : doc.id,
      status: (d.status ?? "requested") as DayOff["status"],
      ...(d.reason ? { reason: String(d.reason) } : {}),
      ...(d.requested_at ? { requested_at: toIso(d.requested_at) ?? undefined } : {}),
      ...(d.decided_at ? { decided_at: toIso(d.decided_at) ?? undefined } : {}),
    };
  });

  const bonusClaims = claims.docs.map((doc) => {
    const d = plain(doc.data()) as Record<string, unknown>;
    return {
      ...(d as unknown as BonusClaim),
      id: doc.id,
      status: ((d.status as string) ?? "claimed") as BonusClaim["status"],
      views_claimed: Number(d.views_claimed ?? 0) || 0,
    };
  });

  const adjustments = adj.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      month: String(d.month ?? ""),
      amount_cents: Math.round(Number(d.amount_cents ?? 0)) || 0,
      note: String(d.note ?? ""),
      created_at: toIso(d.created_at) ?? undefined,
    };
  });

  const invoices = inv.docs
    .map((doc) => {
      const d = plain(doc.data()) as Record<string, unknown>;
      return {
        ...(d as unknown as Invoice),
        number: (d.number as string) || doc.id,
        lines: Array.isArray(d.lines) ? (d.lines as Invoice["lines"]) : [],
        total_cents: Number(d.total_cents ?? 0) || 0,
        status: ((d.status as string) ?? "draft") as Invoice["status"],
        locked: !!d.locked || d.status === "paid",
      };
    })
    .sort((a, b) => (b.month || "").localeCompare(a.month || "") || b.number.localeCompare(a.number));

  return {
    postingDays,
    postingRaw: postingRaw.map(({ _complete, ...rest }) => {
      void _complete;
      return rest;
    }),
    daysOff,
    bonusClaims,
    adjustments,
    invoices,
    onboarding: onboardingProgress(onb.exists ? onb.data()! : null, !!opts.contractSigned),
  };
}

export function summaryFor(c: AdminCreator, h: CreatorHistory, month: YyyyMm): MonthSummary | null {
  if (!c.pay_ready) return null;
  const today = todayIn(c.timezone);
  return monthSummary(payProfileOf(c), month, h.postingDays, h.daysOff, h.bonusClaims, h.adjustments, {
    today: month >= today.slice(0, 7) ? today : undefined,
  });
}

// ------------------------------------------------------------------ calendar

export type DayState =
  | "posted"
  | "approved_off"
  | "requested_off"
  | "missed"
  | "pending"
  | "inactive";

export interface CalendarDay {
  date: YyyyMmDd;
  state: DayState;
  videos: number;
  logged_at: string | null;
}

export function calendarFor(c: AdminCreator, h: CreatorHistory, month: YyyyMm): CalendarDay[] {
  const first = `${month}-01`;
  const last = (() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  })();
  const today = todayIn(c.timezone);
  const posting = new Map<string, { n: number; at: string | null }>();
  for (const p of h.postingRaw) {
    const cur = posting.get(p.date);
    posting.set(p.date, { n: (cur?.n ?? 0) + p.complete, at: cur?.at ?? p.logged_at });
  }
  const off = new Map(h.daysOff.map((d) => [d.date, d.status]));
  return weekdaysBetween(first, last).map((date) => {
    const p = posting.get(date);
    const n = p?.n ?? 0;
    let state: DayState;
    if (!c.start_date || date < c.start_date || (c.ended_on && date > c.ended_on)) state = "inactive";
    else if (n >= VIDEOS_PER_WEEKDAY) state = "posted";
    else if (off.get(date) === "approved") state = "approved_off";
    else if (off.get(date) === "requested") state = "requested_off";
    else if (date >= today) state = "pending";
    else state = "missed";
    return { date, state, videos: n, logged_at: p?.at ?? null };
  });
}

// ------------------------------------------------------------------ attribution

export interface Attribution {
  trials: number;
  purchases: number;
  /** Purchases whose conversion falls inside the selected month. */
  purchasesInWindow: number;
  /** First-charge proceeds for all attributed users (no renewals). */
  recordedProceedsUsd: number;
  /** Converted users with a recorded proceeds total. */
  purchasesWithProceeds: number;
  /** Proceeds from users who converted in the selected month (missing ones filled at the average). */
  proceedsInWindowUsd: number;
}

/**
 * Users whose attribution_campaign EXACTLY matches one of the creator's
 * campaign tags (Firestore `in`, max 30 tags). Trials = started_trial set,
 * purchases = converted_trial set.
 */
export async function attributionFor(tags: string[], windowStartMs: number, windowEndMs: number = Infinity): Promise<Attribution> {
  const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 30);
  const empty = { trials: 0, purchases: 0, purchasesInWindow: 0, recordedProceedsUsd: 0, purchasesWithProceeds: 0, proceedsInWindowUsd: 0 };
  if (!clean.length) return empty;
  const snap = await db()
    .collection("Users")
    .where("attribution_campaign", "in", clean)
    .select("started_trial", "converted_trial", "converted_at", "proceeds_usd_total", "first_proceeds_usd")
    .get();
  const out = { ...empty };
  let windowRecorded = 0;
  let windowMissing = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.started_trial) out.trials++;
    // First paid charge only; renewals don't count toward a creator.
    // Before first_proceeds_usd is set, the total is the first charge: every
    // tracked conversion is on a 3-month plan and too recent to have renewed.
    const proceeds =
      typeof d.first_proceeds_usd === "number"
        ? d.first_proceeds_usd
        : typeof d.proceeds_usd_total === "number"
          ? d.proceeds_usd_total
          : null;
    if (proceeds !== null) out.recordedProceedsUsd += proceeds;
    if (d.converted_trial) {
      out.purchases++;
      if (proceeds !== null) out.purchasesWithProceeds++;
      const at =
        toMs((d.converted_trial as { at?: unknown })?.at) ??
        toMs(d.converted_at) ??
        (toMs((d.started_trial as { at?: unknown })?.at) ?? 0) + 7 * 86400000;
      if (at >= windowStartMs && at < windowEndMs) {
        out.purchasesInWindow++;
        if (proceeds !== null) windowRecorded += proceeds;
        else windowMissing++;
      }
    }
  }
  const avg = out.purchasesWithProceeds > 0 ? out.recordedProceedsUsd / out.purchasesWithProceeds : FALLBACK_PROCEEDS_PER_PURCHASE_USD;
  out.proceedsInWindowUsd = windowRecorded + windowMissing * avg;
  return out;
}

export function roiFlag(ratio: number | null): "green" | "amber" | "red" | "none" {
  if (ratio === null) return "none";
  if (ratio >= ROI_GREEN) return "green";
  if (ratio >= ROI_AMBER) return "amber";
  return "red";
}

// ------------------------------------------------------------------ list row

export interface CreatorRow {
  creator: AdminCreator;
  month: YyyyMm;
  completedMonths: number | null;
  levelBaseCents: number | null;
  nextLevel: { nextBaseCents: number | null; earliestMonth: string | null } | null;
  postedDays: number;
  expectedDays: number;
  missedDays: number;
  /** Missed weekdays in the month before `month` (badge: amber >= 2, red >= 4). */
  missedDaysPrev: number;
  pendingDays: number;
  claims100k: number;
  claims1m: number;
  pendingClaims: number;
  pendingDaysOff: number;
  bonusCents: number;
  totalOwedCents: number;
  attribution: Attribution;
  estProceedsWindowUsd: number;
  payWindowCents: number;
  roiRatio: number | null;
  roiFlag: ReturnType<typeof roiFlag>;
  onboarding: { done: number; total: number };
  latestInvoice: { number: string; month: string; status: string; paid_at: string | null; total_cents: number } | null;
}

export async function buildRow(c: AdminCreator, month: YyyyMm): Promise<CreatorRow> {
  const h = await loadHistory(c.id, { contractSigned: c.contract.status === "signed" });
  const s = summaryFor(c, h, month);
  const prevMonth = addMonths(month, -1);
  const sPrev = summaryFor(c, h, prevMonth);
  // Proceeds and ROI are per selected month: users who started paying in it.
  const windowStartMs = Date.parse(`${month}-01T00:00:00Z`);
  const windowEndMs = Date.parse(`${addMonths(month, 1)}-01T00:00:00Z`);
  const attribution = await attributionFor(c.campaign_tags, windowStartMs, windowEndMs);

  let completedMonths: number | null = null;
  let level: number | null = null;
  let next: CreatorRow["nextLevel"] = null;
  if (c.pay_ready) {
    const hist = { postingDays: h.postingDays, daysOff: h.daysOff };
    completedMonths = completedMonthsAsOf(payProfileOf(c), month, hist);
    level = baseForCompletedMonths(completedMonths);
    const n = nextLevel(payProfileOf(c), hist, month);
    next = { nextBaseCents: n.nextBaseCents, earliestMonth: n.earliestMonth };
  }

  const approved = h.bonusClaims.filter((b) => b.status === "approved");
  const inMonth = (d?: string) => !!d && d.slice(0, 7) === month;
  const estProceedsWindowUsd = attribution.proceedsInWindowUsd;
  const payWindowCents = s?.totalCents ?? 0;
  const roiRatio = payWindowCents > 0 ? estProceedsWindowUsd / (payWindowCents / 100) : null;
  const inv = h.invoices[0];

  return {
    creator: c,
    month,
    completedMonths,
    levelBaseCents: level,
    nextLevel: next,
    postedDays: s?.postedDays ?? 0,
    expectedDays: s?.expectedWeekdays ?? 0,
    missedDays: s?.missedDays ?? 0,
    missedDaysPrev: sPrev?.missedDays ?? 0,
    pendingDays: s?.pendingDays ?? 0,
    claims100k: approved.filter((b) => inMonth(b.crossed_100k_on)).length,
    claims1m: approved.filter((b) => inMonth(b.crossed_1m_on)).length,
    pendingClaims: h.bonusClaims.filter((b) => b.status === "claimed").length,
    pendingDaysOff: h.daysOff.filter((d) => d.status === "requested").length,
    bonusCents: s ? s.bonusLines.reduce((a, l) => a + l.amount_cents, 0) : 0,
    totalOwedCents: s?.totalCents ?? 0,
    attribution,
    estProceedsWindowUsd,
    payWindowCents,
    roiRatio,
    roiFlag: roiFlag(roiRatio),
    onboarding: { done: h.onboarding.done, total: h.onboarding.total },
    latestInvoice: inv
      ? { number: inv.number, month: inv.month, status: inv.status, paid_at: inv.paid_at ?? null, total_cents: inv.total_cents }
      : null,
  };
}

export async function listCreators(): Promise<AdminCreator[]> {
  const snap = await db().collection(CREATORS_COLLECTION).get();
  return snap.docs
    .map((d) => toAdminCreator(d.id, d.data()))
    .sort((a, b) => (a.legal_name || a.name).localeCompare(b.legal_name || b.name));
}

export async function getCreator(id: string): Promise<AdminCreator | null> {
  const doc = await db().collection(CREATORS_COLLECTION).doc(id).get();
  return doc.exists ? toAdminCreator(doc.id, doc.data()!) : null;
}

// ------------------------------------------------------------------ profile writes

/** Whitelisted profile fields an admin may set. Returns {updates} or {error}. */
export function sanitizeProfile(
  body: Record<string, unknown>,
): { updates: Record<string, unknown> } | { error: string } {
  const u: Record<string, unknown> = {};
  const str = (k: string) => {
    if (body[k] !== undefined) u[k] = String(body[k] ?? "").trim();
  };
  str("legal_name");
  str("name");
  str("timezone");
  str("tiktok_handle");
  str("instagram_handle");
  if (body.creator_link_id !== undefined) u.creator_link_id = String(body.creator_link_id ?? "").trim() || null;
  if (body.tracking_url !== undefined) {
    const t = normalizeTrackingUrl(body.tracking_url);
    if (t === null) return { error: "Tracking link must be a full https:// link" };
    u.tracking_url = t;
  }
  if (body.status !== undefined) {
    const st = String(body.status ?? "");
    if (!CREATOR_STATUSES.includes(st)) return { error: "Bad status" };
    u.status = st;
  }
  if (body.email !== undefined) u.email = String(body.email ?? "").trim().toLowerCase();
  if (body.keshah_email !== undefined) {
    const v = String(body.keshah_email ?? "").trim().toLowerCase();
    if (v && !v.endsWith("@keshah.com")) return { error: "keshah_email must be an @keshah.com address" };
    u.keshah_email = v;
  }
  if (body.start_date !== undefined) {
    if (body.start_date && !isDate(body.start_date)) return { error: "start_date must be yyyy-mm-dd" };
    u.start_date = body.start_date || null;
  }
  if (body.ended_on !== undefined) {
    if (body.ended_on && !isDate(body.ended_on)) return { error: "ended_on must be yyyy-mm-dd" };
    u.ended_on = body.ended_on || null;
  }
  if (body.starting_completed_months !== undefined) {
    const n = Number(body.starting_completed_months);
    if (!Number.isInteger(n) || n < 0 || n > 120) return { error: "starting_completed_months must be a whole number" };
    u.starting_completed_months = n;
  }
  if (body.campaign_tags !== undefined) {
    const raw = Array.isArray(body.campaign_tags)
      ? body.campaign_tags
      : String(body.campaign_tags ?? "").split(",");
    u.campaign_tags = [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))].slice(0, 30);
  }
  if (body.w9_on_file !== undefined) u.w9_on_file = !!body.w9_on_file;
  if (body.format_creator !== undefined) u.format_creator = body.format_creator === true;
  if (body.timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: String(body.timezone) });
    } catch {
      return { error: "Unknown timezone" };
    }
  }
  if (body.contract !== undefined && body.contract && typeof body.contract === "object") {
    const c = body.contract as Record<string, unknown>;
    if (c.status !== undefined) {
      // "sent" only via Send contract (it pins the template + hash); manual edits are for paper contracts.
      if (String(c.status) === "sent") return { error: "Use Send contract to send it for e-signature" };
      if (!["none", "signed"].includes(String(c.status))) return { error: "Bad contract status" };
      u["contract.status"] = c.status;
    }
    if (c.template_version !== undefined) u["contract.template_version"] = String(c.template_version ?? "").trim();
    if (c.signed_at !== undefined) u["contract.signed_at"] = c.signed_at ? String(c.signed_at) : null;
    if (c.pdf_path !== undefined) {
      const p = String(c.pdf_path ?? "");
      if (p && !p.startsWith("creators/")) return { error: "Bad contract path" };
      u["contract.pdf_path"] = p || null;
    }
  }
  return { updates: u };
}

/**
 * Accept a creator: keshah.com inbox group, portal invite, contract (see
 * lib/creators/accept.ts). Idempotent; re-running retries unfinished steps.
 */
export async function onCreatorAccepted(id: string, opts: Partial<AcceptOptions> = {}): Promise<AcceptResult> {
  const siteUrl = opts.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://www.keshah.com";
  return acceptCreator(id, { ...opts, siteUrl });
}

/** True if the creator already has a paid (locked) invoice for `month`. */
export async function monthIsPaid(id: string, month: string): Promise<boolean> {
  const snap = await db()
    .collection(CREATORS_COLLECTION)
    .doc(id)
    .collection("invoices")
    .where("month", "==", month)
    .get();
  return snap.docs.some((d) => d.data().status === "paid" || d.data().locked);
}

// ------------------------------------------------------------------ money / records

export function fmtUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

export interface PaidInvoiceRecord {
  creatorId: string;
  creatorName: string;
  invoice: Invoice;
  paidOn: string;
}

/** All paid invoices across creators (optionally filtered by paid date range, inclusive). */
export async function paidInvoices(from?: YyyyMmDd, to?: YyyyMmDd): Promise<{ creators: AdminCreator[]; records: PaidInvoiceRecord[] }> {
  const creators = await listCreators();
  const records: PaidInvoiceRecord[] = [];
  await Promise.all(
    creators.map(async (c) => {
      const snap = await db().collection(CREATORS_COLLECTION).doc(c.id).collection("invoices").where("status", "==", "paid").get();
      for (const doc of snap.docs) {
        const inv = plain(doc.data()) as unknown as Invoice;
        inv.number = inv.number || doc.id;
        const paidOn = (inv.paid_at ?? "").slice(0, 10);
        if (from && paidOn < from) continue;
        if (to && paidOn > to) continue;
        records.push({ creatorId: c.id, creatorName: c.legal_name || c.name, invoice: inv, paidOn });
      }
    }),
  );
  records.sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.invoice.number.localeCompare(b.invoice.number));
  return { creators, records };
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** Standalone printable invoice HTML. */
export function invoiceHtml(c: AdminCreator, inv: Invoice): string {
  const rows = (inv.lines ?? [])
    .map((l) => `<tr><td>${esc(l.label)}</td><td class="r">${esc(fmtUsd(l.amount_cents))}</td></tr>`)
    .join("");
  const meta = [
    ["Invoice #", inv.number],
    ["Period", inv.month],
    ["Status", inv.status],
    ["Submitted", (inv.submitted_at ?? "").slice(0, 10)],
    ["Approved", (inv.approved_at ?? "").slice(0, 10)],
    ["Paid", (inv.paid_at ?? "").slice(0, 10)],
    ["Payment method", inv.status === "paid" ? PAYMENT_METHOD_LABEL : ""],
    ["Payment reference", inv.payment_reference ?? ""],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><span>${esc(k)}</span> ${esc(v)}</div>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(inv.number)}</title>
<style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:720px;margin:40px auto;color:#111;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left;font-size:14px}
.r{text-align:right}.meta div{font-size:13px;margin:2px 0}.meta span{color:#666;display:inline-block;width:140px}.tot td{font-weight:700;border-top:2px solid #111}</style></head>
<body><h1>Invoice ${esc(inv.number)}</h1>
<p><strong>From:</strong> ${esc(c.legal_name || c.name)}${c.email ? ` &lt;${esc(c.email)}&gt;` : ""}<br><strong>To:</strong> KESHAH</p>
<div class="meta">${meta}</div>
<table><thead><tr><th>Description</th><th class="r">Amount (USD)</th></tr></thead><tbody>${rows}
<tr class="tot"><td>Total</td><td class="r">${esc(fmtUsd(inv.total_cents))}</td></tr></tbody></table>
</body></html>`;
}

// ------------------------------------------------------------------ zip (store-only)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Minimal ZIP writer (STORE method, no compression, UTF-8 names, no ZIP64 —
 * fine for evidence packs well under 4 GB). Avoids adding a dependency;
 * PDFs/images are already compressed so STORE costs little.
 */
export function buildZip(files: { name: string; data: Uint8Array | string }[]): Buffer {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = typeof f.data === "string" ? Buffer.from(f.data, "utf8") : Buffer.from(f.data);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 names
    lh.writeUInt16LE(0, 8); // store
    lh.writeUInt16LE(dosTime, 10);
    lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    local.push(lh, name, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(dosTime, 12);
    ch.writeUInt16LE(dosDate, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    // extra len, comment len, disk start, internal attrs = 0
    ch.writeUInt32LE(0, 38); // external attrs
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + data.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

