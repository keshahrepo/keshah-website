/**
 * The 3-day setup deadline after a creator signs, and the "Get started" email
 * for offers nobody has opened the app for. Pure helpers, no Firestore; tests
 * in setup-deadline.test.ts.
 *
 * Setup = the six Getting started steps before warm-up (contract, Slack,
 * Learn, quiz, accounts, bio and link). It's due SETUP_DAYS after the day they
 * signed (their timezone), plus any "Give 3 more days" (setup_extra_days).
 *
 * The deadline pauses while setup is waiting on us: the bio-and-link step
 * can't be done until the founder adds their tracking link. When the link
 * arrives late, they get at least LINK_GRACE_DAYS from that day.
 *
 * Fields on ContentCreators/{id}:
 *   setup_extra_days        number, +3 per "Give 3 more days"
 *   tracking_url_set_at     ISO, when the founder first added the tracking link
 *   get_started_sent_at     ISO, when the "Get started" email went out (once)
 *
 * Nothing here ends an agreement: a missed setup deadline only shows on the
 * founder's Home ("setup" need), with Give 3 more days / End agreement.
 */
import { addDaysYmd, dateIn, deadlineLong, firstNameOf, offerOpen, REMINDER_LEAD_MS, type OfferDoc } from "./deadline";
import { CREATOR_SIGNOFF, lightEmailHtml } from "./invite";

export const SETUP_DAYS = 3;
export const SETUP_EXTEND_DAYS = 3;
export const LINK_GRACE_DAYS = 1;
/** The "Get started" email goes out this long after the offer if they haven't signed in to the app. */
export const GET_STARTED_AFTER_MS = 24 * 3_600_000;

export type SetupStepKey = "contract" | "slack" | "videos" | "quiz" | "accounts" | "link";
export const SETUP_STEP_KEYS: SetupStepKey[] = ["contract", "slack", "videos", "quiz", "accounts", "link"];

/** What the creator sees on a step ("Next: set up your TikTok and Instagram"). */
export const SETUP_STEP_LABELS: Record<SetupStepKey, string> = {
  contract: "sign your contract",
  slack: "join Slack",
  videos: "watch the Learn KESHAH videos",
  quiz: "take the quick check",
  accounts: "set up your TikTok and Instagram",
  link: "add your bio and link",
};

export interface SetupInput {
  timezone: string;
  /** ISO, when they signed (onboarding.contract_signed_at or contract.signed_at). */
  signedAt: string | null;
  steps: Record<SetupStepKey, boolean>;
  trackingUrl: string;
  trackingUrlSetAt?: string | null;
  extraDays?: number;
  /** Getting started fully done (onboarding.completed_at). */
  completed?: boolean;
}

export interface SetupState {
  /** All six setup steps done (warm-up may still be running). */
  done: boolean;
  steps_left: number;
  next_step: SetupStepKey | null;
  /** yyyy-mm-dd in their timezone, null until they've signed. */
  due_date: string | null;
  /** Setup can't finish until the founder adds their tracking link: the deadline is paused. */
  waiting_on_us: boolean;
  /** Calendar days past the due date (0 while on time, done, unsigned or paused). */
  overdue_days: number;
}

const validIso = (v: string | null | undefined): string | null => (v && Number.isFinite(Date.parse(v)) ? v : null);

function localDate(iso: string, tz: string): string {
  try {
    return dateIn(new Date(iso), tz || "UTC");
  } catch {
    return dateIn(new Date(iso), "UTC");
  }
}

export function setupState(x: SetupInput, now: Date): SetupState {
  const left = SETUP_STEP_KEYS.filter((k) => !x.steps[k]);
  const done = !!x.completed || left.length === 0;
  const signed = validIso(x.signedAt);
  const tz = x.timezone || "UTC";
  // Paused only when the link step is all that's left and it's blocked on our tracking link.
  const waiting = !done && left.length === 1 && left[0] === "link" && !x.trackingUrl.trim();
  let due: string | null = null;
  if (signed) {
    due = addDaysYmd(localDate(signed, tz), SETUP_DAYS + Math.max(0, Math.floor(x.extraDays ?? 0)));
    const linkAt = validIso(x.trackingUrlSetAt);
    if (linkAt) {
      const grace = addDaysYmd(localDate(linkAt, tz), LINK_GRACE_DAYS);
      if (grace > due) due = grace;
    }
  }
  let overdue = 0;
  if (due && !done && !waiting) {
    const today = localDate(now.toISOString(), tz);
    if (today > due) overdue = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
  }
  return { done, steps_left: done ? 0 : left.length, next_step: done ? null : (left[0] ?? null), due_date: due, waiting_on_us: waiting, overdue_days: overdue };
}

// ---------------------------------------------------------------- setup nudge (creator app push, email fallback)

/**
 * The daily setup reminder (6 PM local, from the day after signing up to and
 * including the due date): null when nothing should go out today.
 */
export function setupNudgeKind(st: SetupState, today: string, signedDate: string | null): "daily" | "last_day" | null {
  if (st.done || st.waiting_on_us || !st.due_date || !signedDate || st.next_step === "contract") return null;
  if (today <= signedDate || today > st.due_date) return null;
  return today === st.due_date ? "last_day" : "daily";
}

export function setupNudgePush(kind: "daily" | "last_day", st: SetupState): { title: string; body: string; data: Record<string, string> } {
  const step = st.next_step ? SETUP_STEP_LABELS[st.next_step] : "finish setting up";
  const left = st.steps_left === 1 ? "1 step left" : `${st.steps_left} steps left`;
  return kind === "last_day"
    ? { title: "Last day to finish setup", body: `${left}. Next: ${step}. Finish today to keep your spot.`, data: { type: "setup" } }
    : { title: "Finish setting up", body: `${left}. Next: ${step}.`, data: { type: "setup" } };
}

export function setupNudgeEmail(input: { firstName: string; kind: "daily" | "last_day"; st: SetupState; dueLabel: string }): { subject: string; text: string; html: string } {
  const step = input.st.next_step ? SETUP_STEP_LABELS[input.st.next_step] : "finish setting up";
  const paras = [
    { text: `Hi ${input.firstName || "there"},` },
    input.kind === "last_day"
      ? { text: `Today is the last day to finish your setup in the KESHAH Creators app, so you keep your spot.`, bold: true }
      : { text: `You're almost set up in the KESHAH Creators app. Please finish by ${input.dueLabel} to keep your spot.` },
    { text: `Next up: ${step}. Open the app and it picks up right where you left off.` },
    { text: "If anything is holding you up, just reply to this email and I'll help." },
  ];
  const text = [...paras.flatMap((x) => [x.text, ""]), CREATOR_SIGNOFF].join("\n");
  return { subject: input.kind === "last_day" ? "Last day to finish your KESHAH setup" : "Finish setting up your KESHAH account", text, html: lightEmailHtml(paras) };
}

// ---------------------------------------------------------------- "Get started" email (offer open, app never opened)

export interface GetStartedDoc extends OfferDoc {
  accepted_at?: unknown;
  app_first_signed_in_at?: unknown;
  get_started_sent_at?: unknown;
}

function isoOf(v: unknown): string | null {
  if (typeof v === "string") return validIso(v);
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === "function" ? t.toDate().toISOString() : null;
}

/**
 * 24 hours after the offer, while it's open, they haven't signed in to the app
 * and the final reminder window hasn't opened yet. Once per offer.
 */
export function getStartedDue(d: GetStartedDoc, now: Date): boolean {
  if (!offerOpen(d) || d.get_started_sent_at || isoOf(d.app_first_signed_in_at)) return false;
  const accepted = isoOf(d.accepted_at);
  const deadline = typeof d.contract_deadline_at === "string" ? Date.parse(d.contract_deadline_at) : NaN;
  if (!accepted || !Number.isFinite(deadline)) return false;
  const t = now.getTime();
  return t >= Date.parse(accepted) + GET_STARTED_AFTER_MS && t < deadline - REMINDER_LEAD_MS;
}

export function getStartedEmail(input: { firstName: string; appUrl: string | null; signInEmail: string; deadlineIso: string }): { subject: string; text: string; html: string } {
  const paras = [
    { text: `Hi ${input.firstName || "there"},` },
    { text: "Just checking you saw your offer. To lock in your spot:" },
    { text: input.appUrl ? `1. Download the KESHAH Creators app: ${input.appUrl}` : "1. Download the KESHAH Creators app (link in your offer email)" },
    { text: `2. Sign in with ${input.signInEmail}` },
    { text: "3. Sign your agreement. It's the first thing the app shows you." },
    { text: `Your offer is open until ${deadlineLong(input.deadlineIso)}.`, bold: true },
    { text: "If anything is holding you up, just reply to this email and I'll help." },
  ];
  const text = [...paras.flatMap((x) => [x.text, ""]), CREATOR_SIGNOFF].join("\n");
  return { subject: "Your KESHAH spot is waiting", text, html: lightEmailHtml(paras) };
}

/** SetupInput from a raw ContentCreators doc + its onboarding state and step checks (db.onboardingSteps). */
export function setupInputFromDoc(
  d: Record<string, unknown>,
  onb: { contract_signed_at?: string | null; completed_at?: string | null } | null,
  steps: Record<SetupStepKey, boolean>,
): SetupInput {
  const contract = (d.contract ?? {}) as { signed_at?: unknown };
  return {
    timezone: typeof d.timezone === "string" ? d.timezone : "UTC",
    signedAt: onb?.contract_signed_at || isoOf(contract.signed_at),
    steps,
    trackingUrl: typeof d.tracking_url === "string" ? d.tracking_url : "",
    trackingUrlSetAt: isoOf(d.tracking_url_set_at),
    extraDays: Number(d.setup_extra_days ?? 0) || 0,
    completed: !!onb?.completed_at,
  };
}

export { firstNameOf };
