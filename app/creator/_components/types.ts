import type { InvoiceLine, OnboardingState, PostingDay } from "@/lib/creators/types";

export interface MonthData {
  month: string;
  /** false until the first posting day (pay starts then). */
  started: boolean;
  today: string;
  expectedWeekdays: number;
  calendarWeekdays: number;
  postedDays: number;
  approvedOffDays: number;
  missedDays: number;
  pendingDays: number;
  completedMonthsBefore: number;
  levelBaseCents: number;
  baseDueCents: number;
  bonusLines: InvoiceLine[];
  adjustmentLines: InvoiceLine[];
  bonusCents: number;
  totalCents: number;
  nextLevel: { nextBaseCents: number | null; monthsNeeded: number | null; earliestMonth: string | null };
  trial: { postedDays: number; isInTrial: boolean; trialEndsAfterDate?: string };
  days: { date: string; state: "posted" | "off" | "off_requested" | "missed" | "pending"; videos: number }[];
}

export interface PortalData {
  creator: {
    name: string;
    legal_name: string;
    email: string;
    keshah_email: string;
    tiktok_handle: string;
    instagram_handle: string;
    timezone: string;
    start_date: string;
    tracking_url: string;
    format_creator: boolean;
  };
  onboarding: OnboardingState & { complete: boolean };
  contract: { status: "none" | "sent" | "signed"; signed_at: string | null };
  tracking_url: string | null;
  config: {
    slack_invite_url: string | null;
    site_url: string;
    founder_videos: { id: string; title: string; url: string }[];
    quiz: { id: string; question: string; options: string[] }[];
    accounts_step_text: string;
    verification_code_text: string;
    suggested_handle: string;
    handle_taken_text: string;
    accounts_guide_url: string | null;
    warmup_days: number;
    warmup_headline: string;
    warmup_text: string;
    warmup_done_text: string;
    posting_guide_url: string | null;
    posting_rules: string[];
    videos_per_weekday: number;
  };
  today: { date: string; is_weekday: boolean; ms_until_deadline: number; log: PostingDay | null };
  month: MonthData;
}
