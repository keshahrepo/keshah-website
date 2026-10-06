/**
 * Creator payment system: data model.
 *
 * Firestore layout
 * ----------------
 *   Creators/{creatorId}                      CreatorProfile (existing link-tracking doc
 *                                             + the pay fields below, all additive)
 *   Creators/{creatorId}/clicks/{id}          (existing, unchanged)
 *   Creators/{creatorId}/posting_days/{date}  PostingDay   doc id = creator-local yyyy-mm-dd
 *   Creators/{creatorId}/days_off/{date}      DayOff       doc id = creator-local yyyy-mm-dd
 *   Creators/{creatorId}/bonus_claims/{id}    BonusClaim   auto id
 *   Creators/{creatorId}/adjustments/{id}     Adjustment   auto id
 *   Creators/{creatorId}/invoices/{number}    Invoice      doc id = invoice number, e.g. "IT-001"
 *
 * Conventions
 *   - All money is integer cents (USD).
 *   - Calendar dates are "yyyy-mm-dd" strings in the CREATOR'S timezone.
 *   - Months are "yyyy-mm" strings.
 *   - Instants (logged_at, submitted_at, ...) are ISO-8601 strings (UTC).
 *
 * Note: the creator portal login (/creator, /api/creator/me) currently reads the
 * separate `ContentCreators` collection, not `Creators`. These types extend
 * `Creators` only; nothing here changes either collection's existing fields.
 */

export type YyyyMmDd = string;
export type YyyyMm = string;
export type IsoInstant = string;
export type Cents = number;

/** Fields already written by app/api/creators/route.ts (POST). */
export interface CreatorsDoc {
  name: string;
  slug: string;
  platforms: { platform: string; [k: string]: unknown }[];
  platform_slugs: Record<string, string>;
  platform_clicks: Record<string, number>;
  all_slugs: string[];
  short_link: string;
  total_clicks: number;
  notes: string;
  is_active: boolean;
  created_at: unknown; // Firestore Timestamp
}

export type CreatorStatus = "onboarding" | "trial" | "active" | "leaving" | "ended";

export interface CreatorContract {
  status: "none" | "sent" | "signed";
  signed_at?: IsoInstant;
  pdf_path?: string;
  template_version?: string;
}

export type PayoutMethod = "amex_ach";

/** Pay-system fields added onto a Creators doc. */
export interface CreatorPayFields {
  legal_name: string;
  email: string;
  /** IANA zone, e.g. "America/Chicago". */
  timezone: string;
  start_date: YyyyMmDd;
  /** Completed months credited before start_date (default 0). */
  starting_completed_months: number;
  /** e.g. ["Isai TikTok", "Isai Insta"]. */
  campaign_tags: string[];
  status: CreatorStatus;
  /** Last working day, inclusive. */
  ended_on?: YyyyMmDd;
  contract: CreatorContract;
  w9_on_file: boolean;
  payout_method: PayoutMethod;
}

export type CreatorProfile = CreatorsDoc & CreatorPayFields;

/** The subset of a profile the pay calculator needs. */
export type PayProfile = Pick<CreatorPayFields, "start_date" | "starting_completed_months"> &
  Partial<Pick<CreatorPayFields, "ended_on" | "legal_name" | "timezone">>;

export type Platform = "tiktok" | "instagram";

export interface PostedVideo {
  platform: Platform;
  url: string;
}

export interface PostingDay {
  /** Creator-local date. */
  date: YyyyMmDd;
  videos: PostedVideo[];
  logged_at: IsoInstant;
}

export interface DayOff {
  date: YyyyMmDd;
  status: "requested" | "approved" | "declined";
}

export interface BonusClaim {
  video_url: string;
  platform: Platform;
  posted_on: YyyyMmDd;
  crossed_100k_on?: YyyyMmDd;
  crossed_1m_on?: YyyyMmDd;
  views_claimed: number;
  screenshot_path?: string;
  status: "claimed" | "approved" | "rejected";
  admin_note?: string;
}

export interface Adjustment {
  month: YyyyMm;
  /** Positive or negative. */
  amount_cents: Cents;
  note: string;
}

export type InvoiceLineKind =
  | "base"
  | "bonus_100k"
  | "bonus_1m"
  | "bonus_1m_topup"
  | "adjustment";

export interface InvoiceLine {
  kind: InvoiceLineKind;
  label: string;
  amount_cents: Cents;
}

export type InvoiceStatus = "draft" | "submitted" | "approved" | "paid";

export interface Invoice {
  /** e.g. "IT-001". */
  number: string;
  month: YyyyMm;
  lines: InvoiceLine[];
  total_cents: Cents;
  status: InvoiceStatus;
  submitted_at?: IsoInstant;
  approved_at?: IsoInstant;
  paid_at?: IsoInstant;
  payment_reference?: string;
  payment_proof_path?: string;
  locked: boolean;
}
