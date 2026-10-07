/**
 * Creator payment system: data model.
 *
 * Firestore layout
 * ----------------
 *   ContentCreators/{creatorId}                      CreatorDoc: the existing portal-login doc
 *                                                    (name, email, password_hash, status,
 *                                                    videos_per_day, streak, ...) + the pay /
 *                                                    profile fields below, all additive.
 *   ContentCreators/{creatorId}/posting_days/{date}  PostingDay   doc id = creator-local yyyy-mm-dd
 *   ContentCreators/{creatorId}/days_off/{date}      DayOff       doc id = creator-local yyyy-mm-dd
 *   ContentCreators/{creatorId}/bonus_claims/{id}    BonusClaim   auto id
 *   ContentCreators/{creatorId}/adjustments/{id}     Adjustment   auto id
 *   ContentCreators/{creatorId}/invoices/{number}    Invoice      doc id = invoice number, e.g. "IT-001"
 *   ContentCreators/{creatorId}/onboarding/state     OnboardingState
 *   ContentCreators/{creatorId}/contract_events/{id} ContractEvent  append-only audit log
 *   Settings/creator_contracts                       ContractSettings (founder countersignature)
 *
 *   Creators/{linkId}                                CreatorsDoc: short link + click tracking.
 *                                                    Linked from ContentCreators.creator_link_id.
 *
 * Conventions
 *   - All money is integer cents (USD).
 *   - Calendar dates are "yyyy-mm-dd" strings in the CREATOR'S timezone.
 *   - Months are "yyyy-mm" strings.
 *   - Instants (logged_at, submitted_at, ...) are ISO-8601 strings (UTC).
 *
 * Data access lives in lib/creators/db.ts (server only).
 */

export type YyyyMmDd = string;
export type YyyyMm = string;
export type IsoInstant = string;
export type Cents = number;

/** Creators/{linkId}: fields written by app/api/creators/route.ts (POST). */
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

/** Everything recorded when a creator e-signs (also printed on the audit certificate page). */
export interface ContractAudit {
  /** Random id printed on every page of the signed PDF. */
  document_id: string;
  template_version: string;
  template_sha256: string;
  signer_typed_name: string;
  signer_legal_name: string;
  signer_address: string;
  signer_email: string;
  /** ContentCreators doc id from the session token. */
  signer_user_id: string;
  signer_ip: string;
  signer_user_agent: string;
  signed_at_utc: IsoInstant;
  /** Human-readable time in the creator's timezone, e.g. "October 6, 2026 at 3:04:05 PM CDT". */
  signed_at_local: string;
  signer_timezone: string;
  consent_text_version: string;
  consent_text_sha256: string;
  sent_at?: IsoInstant;
  first_viewed_at?: IsoInstant;
  countersigner_name: string;
  countersigner_title: string;
  entity_name: string;
  /** SHA-256 of the founder's signature image. Only for a drawn/uploaded countersignature. */
  countersignature_sha256?: string;
  /** How the creator signed, e.g. "Great Vibes typed" (absent on contracts signed before adopt-a-signature). */
  signature_style?: string;
  /** The exact text the creator adopted as their signature. */
  signature_adopted_text?: string;
  /** "Great Vibes typed" or "drawn image". */
  countersignature_style?: string;
  /** Founder's adopted signature text + when he adopted it (typed countersignature only). */
  countersignature_adopted_text?: string;
  countersignature_adopted_at?: IsoInstant;
}

export interface CreatorContract {
  status: "none" | "sent" | "signed";
  signed_at?: IsoInstant;
  pdf_path?: string;
  template_version?: string;
  /** Set on "Send contract": hash of the template the creator will sign. */
  template_sha256?: string;
  sent_at?: IsoInstant;
  /** First time the creator opened the contract PDF in the portal. */
  viewed_at?: IsoInstant;
  /** SHA-256 of the final signed PDF (present only for portal e-signatures). */
  signed_sha256?: string;
  audit?: ContractAudit;
}

/** Settings/creator_contracts */
export interface ContractSettings {
  founder_name: string;
  founder_title: string;
  entity_name: string;
  /** Storage path of the founder's signature PNG (contracts/founder_signature.png). */
  signature_path?: string;
  signature_sha256?: string;
  signature_updated_at?: IsoInstant;
  /** True: countersign with the drawn/uploaded PNG. Otherwise the generated (typed) signature is used. */
  use_drawn_signature?: boolean;
  /** One-time "Adopt this signature" record for the generated countersignature. */
  founder_signature_adopted_at?: IsoInstant;
  founder_signature_adopted_text?: string;
  updated_at?: IsoInstant;
  /** CreatorContractTemplates doc id that "Send contract" uses. */
  current_template_version?: string;
}

/** CreatorContractTemplates/{version}: an uploaded contract PDF. Immutable. */
export interface ContractTemplate {
  version: string;
  title: string;
  sha256: string;
  /** contracts/templates/<version>.pdf */
  storage_path: string;
  pages: number;
  bytes: number;
  uploaded_at: IsoInstant;
}

/** ContentCreators/{id}/contract_events/{auto}: written once, never updated. */
export interface ContractEvent {
  type: "sent" | "viewed" | "signed" | "emailed" | "email_failed";
  at: IsoInstant;
  actor: "admin" | "creator" | "system";
  template_version?: string;
  template_sha256?: string;
  signed_sha256?: string;
  pdf_path?: string;
  ip?: string;
  user_agent?: string;
  detail?: string;
  audit?: ContractAudit;
}

export type PayoutMethod = "amex_ach";

/** Pay-system fields added onto a ContentCreators doc. */
export interface CreatorPayFields {
  legal_name: string;
  /** Login / contact email (the existing ContentCreators.email). */
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

/** Portal / onboarding fields added onto a ContentCreators doc. */
export interface CreatorPortalFields {
  /** The @keshah.com address KESHAH set up for them (accounts are owned by KESHAH). */
  keshah_email: string;
  tiktok_handle: string;
  instagram_handle: string;
  /** Creators/{id} doc holding their old short link (kept, no longer shown to creators). */
  creator_link_id: string | null;
  /** Attribution link the creator shares (e.g. an AppStack campaign link). Set by admin; any https URL. */
  tracking_url: string;
  /** Last invoice sequence number issued (0 = none yet). */
  invoice_seq: number;
  /**
   * Invite-only "format creator": 2 of their 5 daily videos are their own new
   * concepts (Today rows 4 and 5); everyone else posts 5 given videos.
   * Display only; pay is unchanged (their extra is an adjustment / contract matter).
   */
  format_creator: boolean;
}

/** Existing ContentCreators fields the pay system reads (never rewrites). */
export interface ContentCreatorLegacyFields {
  name: string;
  is_active: boolean;
  manager_id: string | null;
  videos_per_day: number;
  streak: number;
  trial_start_date?: YyyyMmDd;
  /** Raw ContentCreators.status before mapping (e.g. "trial", "cut"). */
  legacy_status: string | null;
}

/** Normalised creator, as returned by db.getCreator / db.listCreators. */
export type CreatorProfile = { id: string } & ContentCreatorLegacyFields &
  CreatorPayFields &
  CreatorPortalFields;

/** The subset of a profile the pay calculator needs. */
export type PayProfile = Pick<CreatorPayFields, "start_date" | "starting_completed_months"> &
  Partial<Pick<CreatorPayFields, "ended_on" | "legal_name" | "timezone">>;

export type Platform = "tiktok" | "instagram";

/**
 * One unique video, posted on BOTH platforms. A weekday counts as posted only
 * with >= VIDEOS_PER_WEEKDAY videos whose tiktok_url AND instagram_url are
 * both non-empty.
 */
export interface PostedVideo {
  tiktok_url: string;
  instagram_url: string;
  /**
   * Optional: the video that inspired a format creator's own concept (rows 4 and 5).
   * Informational only; never part of the pay rule.
   */
  inspired_by_url?: string;
  /**
   * The proven video this row remakes (ProvenVideos id), set by the server from
   * that day's daily pick in the same position. Best effort; never part of pay.
   */
  proven_id?: string;
}

export interface PostingDay {
  /** Creator-local date. */
  date: YyyyMmDd;
  videos: PostedVideo[];
  /** Last save. */
  logged_at: IsoInstant;
  /**
   * "auto" when the post sync created the day, "manual+auto" when it filled
   * gaps in a creator's log (stored doc only). Absent = saved by the creator.
   * auto_urls lists the links the sync added (db.toPostingDay returns it, and
   * savePostingDay keeps the ones still in the log).
   */
  source?: "auto" | "manual+auto";
  auto_urls?: string[];
  auto_synced_at?: IsoInstant;
}

export interface DayOff {
  date: YyyyMmDd;
  status: "requested" | "approved" | "declined";
  reason?: string;
  requested_at?: IsoInstant;
  decided_at?: IsoInstant;
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
  claimed_at?: IsoInstant;
  reviewed_at?: IsoInstant;
  /** "auto": created by the post sync (lib/creators/post-sync.ts). Absent = submitted by the creator. */
  source?: "manual" | "auto";
}

/**
 * ContentCreators/{id}/posts/{platform}_{post_id}: every post the ScrapeCreators
 * sync has seen (lib/creators/post-sync.ts). Written by the sync only.
 */
export interface CreatorPost {
  platform: Platform;
  /** TikTok aweme_id / Instagram shortcode. */
  post_id: string;
  url: string;
  handle: string;
  posted_at: IsoInstant;
  /** posted_at in the creator's timezone. */
  local_date: YyyyMmDd;
  caption: string;
  views: number;
  /** One entry per sync at most (when views changed or a day passed); newest last, capped. */
  views_history: { at: IsoInstant; views: number }[];
  pinned: boolean;
  first_seen_at: IsoInstant;
  last_synced_at: IsoInstant;
  /** First sync that saw views >= 100K / 1M. */
  crossed_100k_at: IsoInstant | null;
  crossed_1m_at: IsoInstant | null;
  /** Latest cover image seen (signed CDN URL that expires after a few days), null when none. */
  thumbnail_url?: string | null;
}

/** ContentCreators/{id}.post_sync: health of the automatic post sync. */
export interface PostSyncState {
  last_run_at?: IsoInstant;
  last_ok_at?: IsoInstant;
  last_error?: string | null;
  last_error_at?: IsoInstant | null;
  consecutive_failures: number;
  credits_remaining?: number | null;
  /** Pages the last successful DEEP run fetched (both platforms), for the credit estimate. */
  last_deep_pages?: number;
  last_deep_at?: IsoInstant;
}

export interface Adjustment {
  month: YyyyMm;
  /** Positive or negative. */
  amount_cents: Cents;
  note: string;
  created_at?: IsoInstant;
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
  /** True once paid: no further edits. */
  locked: boolean;
  /** Snapshotted on submit for the printable invoice. */
  creator_legal_name?: string;
  period_start?: YyyyMmDd;
  period_end?: YyyyMmDd;
  created_at?: IsoInstant;
  updated_at?: IsoInstant;
}

export type OnboardingStep = "videos" | "quiz" | "accounts" | "slack" | "warmup" | "rules" | "link";

/** Every Getting started step, in portal order. "contract" is completed by e-signing, not setOnboardingStep. */
export type OnboardingStepKey = "contract" | OnboardingStep;

/** ContentCreators/{id}/onboarding/state */
export interface OnboardingState {
  /** Step 0 "Sign your contract": set when the e-signature completes (or admin marks the contract signed). */
  contract_signed_at?: IsoInstant;
  /** Step 1 "Learn KESHAH": FOUNDER_VIDEOS id -> watched-at instant. */
  videos_watched: Record<string, IsoInstant>;
  /** Step 2: QUIZ passed (all answers correct). */
  quiz_passed_at?: IsoInstant;
  quiz_attempts?: number;
  /** Step 3: handles saved. */
  accounts_done_at?: IsoInstant;
  /** Step 4. */
  slack_joined_at?: IsoInstant;
  /** Step 5: distinct creator-local dates ticked (done at WARMUP_DAYS). */
  warmup_days?: YyyyMmDd[];
  /** Step 6: posting guide read. */
  rules_ack_at?: IsoInstant;
  /** Step 7. */
  link_seen_at?: IsoInstant;
  /** All steps done (ready_at is set at the same moment). */
  completed_at?: IsoInstant;
  ready_at?: IsoInstant;
}

export type AcceptStepKey = "group" | "invite" | "contract";

export interface AcceptStepRecord {
  status: "done" | "skipped" | "error";
  at: IsoInstant;
  detail: string;
}

/**
 * ContentCreators/{id}.accept: what the admin "Accept creator" button did.
 * Re-running Accept retries only steps that aren't "done".
 */
export interface AcceptRecord {
  steps: Partial<Record<AcceptStepKey, AcceptStepRecord>>;
  last_run_at?: IsoInstant;
  /** Short lock so a double click can't run two provisioning passes at once. */
  running_until?: IsoInstant | null;
}
