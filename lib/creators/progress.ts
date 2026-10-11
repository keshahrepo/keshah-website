/**
 * A creator's journey from "Accepted" to the end of their trial, as one
 * ordered timeline for the founder app (creator page, Creators list, Home).
 *
 * Pure: callers pass what they already loaded. Sources per step:
 *   accepted        ContentCreators.accepted_at (else done without a date once anything later happened)
 *   welcome_email   ContentCreators.accept.steps.invite ({status, at})
 *   app_signed_in   ContentCreators.app_first_signed_in_at (stamped by GET /api/mobile/me)
 *   contract        ContentCreators.contract.signed_at / onboarding/state.contract_signed_at;
 *                   contract.status "sent" means it's on the creator, "none" means it's on the founder
 *   slack .. rules  onboarding/state *_at fields (videos: the last of videos_watched, once all are watched)
 *   warmup          onboarding/state.warmup_days (done at WARMUP_DAYS ticks)
 *   first_post      ContentCreators.start_date (set by the first posting day)
 *   trial           lib/creators/pay.ts trialStatus (day n of 20, promoted, ended)
 *
 * Never invents a date: a step known to be done without a timestamp is done with at = null.
 */
import { FOUNDER_VIDEOS, WARMUP_DAYS } from "./onboarding-content";
import type { AcceptRecord } from "./types";

export type ProgressKey =
  | "accepted"
  | "welcome_email"
  | "app_signed_in"
  | "contract"
  | "slack"
  | "videos"
  | "quiz"
  | "accounts"
  | "link"
  | "rules"
  | "warmup"
  | "first_post"
  | "trial";

export type ProgressState = "done" | "current" | "todo" | "skipped";

export interface ProgressStep {
  key: ProgressKey;
  label: string;
  state: ProgressState;
  /** ISO instant or yyyy-mm-dd, when known. */
  at: string | null;
  detail?: string;
  /** Current step only: who has to act next. */
  waitingOn?: "creator" | "you";
}

export interface CreatorProgress {
  steps: ProgressStep[];
  /** Key of the first step that isn't done (null when everything is done). */
  current: ProgressKey | null;
  /** When the step before the current one was completed (latest known), else null. */
  currentSince: string | null;
  /** Whole days on the current step (null without currentSince). */
  days: number | null;
  /** On the creator, and on the current step for STUCK_DAYS or more. */
  stuck: boolean;
}

/** Compact form for list rows: the current step only. */
export interface ProgressStepSummary {
  key: ProgressKey | null;
  /** e.g. "Contract", "Warm-up day 2 of 3", "Trial day 4 of 20"; "Done" when nothing is left. */
  label: string;
  days: number | null;
  stuck: boolean;
  waitingOn: "creator" | "you" | null;
}

export const STUCK_DAYS = 2;
const DAY_MS = 86_400_000;

export interface ProgressInput {
  /** mapCreatorStatus(status). */
  status: string;
  acceptedAt?: string | null;
  accept?: AcceptRecord | null;
  appFirstSignedInAt?: string | null;
  contract?: { status?: string; sent_at?: string; signed_at?: string } | null;
  /** Raw onboarding/state (fields read defensively). */
  onboarding?: Record<string, unknown> | null;
  trackingUrl?: string;
  /** "" until the first posting day. */
  startDate?: string;
  /** Legacy start date (old program fallback): not a real first posting day. */
  legacyStart?: boolean;
  trialPlan?: string | null;
  /** trialStatus() output, when the creator has started. */
  trial?: {
    postedDays: number;
    isInTrial: boolean;
    requiredDays?: number;
    completedOn?: string;
    promotedOn?: string;
    reviewing?: boolean;
    ended?: boolean;
  } | null;
}

const str = (v: unknown): string | null => {
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
};

const ms = (at: string | null): number => (at ? Date.parse(at.length === 10 ? `${at}T00:00:00Z` : at) : NaN);

function latest(ats: (string | null)[]): string | null {
  let best: string | null = null;
  for (const a of ats) if (a && Number.isFinite(ms(a)) && (!best || ms(a) > ms(best))) best = a;
  return best;
}

/** Weekdays (Mon-Fri) after `from` up to and including `to` (UTC dates). */
function weekdaysBetween(fromMs: number, toMs: number): number {
  let n = 0;
  const start = Math.floor(fromMs / DAY_MS) + 1;
  const end = Math.floor(toMs / DAY_MS);
  for (let d = start; d <= end && n < 60; d++) {
    const wd = new Date(d * DAY_MS).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

export function creatorProgress(input: ProgressInput, now: Date = new Date()): CreatorProgress {
  const o = (input.onboarding ?? {}) as Record<string, unknown>;
  const steps = input.accept?.steps ?? {};
  const contract = input.contract ?? {};
  const allOnboarded = !!str(o.completed_at);
  const finished = input.status === "active" || input.status === "leaving";

  // ---- raw facts
  const watched = (o.videos_watched && typeof o.videos_watched === "object" ? o.videos_watched : {}) as Record<string, unknown>;
  const videosDone = FOUNDER_VIDEOS.every((v) => !!str(watched[v.id]));
  const videosAt = videosDone ? latest(FOUNDER_VIDEOS.map((v) => str(watched[v.id]))) : null;
  const warmupDays = (Array.isArray(o.warmup_days) ? o.warmup_days : []).filter((d): d is string => typeof d === "string").sort();
  const warmupDone = warmupDays.length >= WARMUP_DAYS;
  const contractSignedAt = str(contract.signed_at) ?? str(o.contract_signed_at);
  const contractSigned = contract.status === "signed" || !!str(o.contract_signed_at);
  const started = !!input.startDate && !input.legacyStart;

  const onb: Record<"slack" | "quiz" | "accounts" | "link" | "rules", string | null> = {
    slack: str(o.slack_joined_at),
    quiz: str(o.quiz_passed_at),
    accounts: str(o.accounts_done_at),
    link: str(o.link_seen_at),
    rules: str(o.rules_ack_at),
  };
  const anyOnboarding = videosDone || warmupDays.length > 0 || Object.values(onb).some(Boolean) || allOnboarded;
  const laterThanSignIn = contractSigned || anyOnboarding || started || finished;

  type Draft = Omit<ProgressStep, "state"> & { done: boolean; skipped?: boolean; waitingOn?: "creator" | "you" };
  const d: Draft[] = [];

  // Accepted
  const invite = steps.invite;
  const acceptedKnown = !!input.acceptedAt || Object.keys(steps).length > 0;
  d.push({
    key: "accepted",
    label: "Accepted",
    at: str(input.acceptedAt),
    done: acceptedKnown || laterThanSignIn || !!input.appFirstSignedInAt,
    waitingOn: "you",
  });

  // Welcome email
  if (invite?.status === "done") {
    d.push({ key: "welcome_email", label: "Welcome email sent", at: str(invite.at), done: true });
  } else if (invite?.status === "skipped" || (!invite && (laterThanSignIn || !!input.appFirstSignedInAt))) {
    d.push({ key: "welcome_email", label: "Welcome email sent", at: null, done: false, skipped: true, ...(invite ? { detail: "They already had a password" } : {}) });
  } else {
    d.push({
      key: "welcome_email",
      label: "Welcome email sent",
      at: null,
      done: false,
      waitingOn: "you",
      ...(invite?.status === "error" ? { detail: "The email didn't go out" } : {}),
    });
  }

  // Signed in to the app
  d.push({
    key: "app_signed_in",
    label: "Signed in to the app",
    at: str(input.appFirstSignedInAt),
    done: !!input.appFirstSignedInAt || laterThanSignIn,
    waitingOn: "creator",
  });

  // Contract
  const sent = contract.status === "sent";
  d.push({
    key: "contract",
    label: "Contract signed",
    at: contractSigned ? contractSignedAt : null,
    done: contractSigned || allOnboarded || started || finished,
    waitingOn: contractSigned || sent ? "creator" : "you",
    ...(!contractSigned && !sent ? { detail: "Contract not sent yet" } : {}),
  });

  const onbDone = (k: keyof typeof onb) => !!onb[k] || allOnboarded || started || finished;
  d.push({ key: "slack", label: "Slack", at: onb.slack, done: onbDone("slack"), waitingOn: "creator" });
  d.push({ key: "videos", label: "Videos", at: videosAt, done: videosDone || allOnboarded || started || finished, waitingOn: "creator" });
  d.push({ key: "quiz", label: "Quiz", at: onb.quiz, done: onbDone("quiz"), waitingOn: "creator" });
  d.push({ key: "accounts", label: "Accounts created", at: onb.accounts, done: onbDone("accounts"), waitingOn: "creator" });
  const linkReady = !!(input.trackingUrl ?? "").trim();
  d.push({
    key: "link",
    label: "Link in bio",
    at: onb.link,
    done: onbDone("link"),
    waitingOn: linkReady || onb.link ? "creator" : "you",
    ...(!onb.link && !linkReady ? { detail: "Their link isn't set up yet" } : {}),
  });
  d.push({ key: "rules", label: "Rules", at: onb.rules, done: onbDone("rules"), waitingOn: "creator" });
  const warmDone = warmupDone || allOnboarded || started || finished;
  d.push({
    key: "warmup",
    label: "Warm-up",
    at: warmupDone ? warmupDays[WARMUP_DAYS - 1] : null,
    done: warmDone,
    waitingOn: "creator",
    ...(warmDone && !warmupDays.length ? {} : { detail: `${Math.min(warmupDays.length, WARMUP_DAYS)} of ${WARMUP_DAYS} days` }),
  });

  // First posting day
  d.push({
    key: "first_post",
    label: "First posting day",
    at: started ? input.startDate! : null,
    done: started || finished || (input.trial?.postedDays ?? 0) > 0,
    waitingOn: "creator",
  });

  // Trial
  const t = input.trial;
  const of = t?.requiredDays ?? 20;
  if (t?.promotedOn) {
    d.push({ key: "trial", label: "Promoted", at: t.promotedOn, done: true, detail: "Finished the trial" });
  } else if (t?.ended) {
    d.push({ key: "trial", label: "Ended", at: t.completedOn ?? null, done: true, detail: "After the trial" });
  } else if (finished || (t && !t.isInTrial)) {
    d.push({ key: "trial", label: "Trial", at: t?.completedOn ?? null, done: true });
  } else if (t?.reviewing) {
    d.push({ key: "trial", label: "Trial", at: null, done: false, detail: `Day ${of} of ${of}, your call`, waitingOn: "you" });
  } else {
    // A running trial isn't "stuck": missed days show on the calendar.
    d.push({ key: "trial", label: "Trial", at: null, done: false, waitingOn: "creator", ...(t ? { detail: `Day ${t.postedDays} of ${of}` } : {}) });
  }

  // ---- states
  const currentIdx = d.findIndex((s) => !s.done && !s.skipped);
  const out: ProgressStep[] = d.map((s, i) => {
    const state: ProgressState = s.done ? "done" : s.skipped ? "skipped" : i === currentIdx ? "current" : "todo";
    const step: ProgressStep = { key: s.key, label: s.label, state, at: s.done ? s.at : null };
    if (s.detail) step.detail = s.detail;
    if (state === "current" && s.waitingOn) step.waitingOn = s.waitingOn;
    return step;
  });

  if (currentIdx < 0) return { steps: out, current: null, currentSince: null, days: null, stuck: false };
  const cur = d[currentIdx];
  const before = d.slice(0, currentIdx).filter((s) => s.done).map((s) => s.at);
  // The step's own clock starts at its trigger when that's later (contract sent, last warm-up tick).
  if (cur.key === "contract" && sent) before.push(str(contract.sent_at));
  if (cur.key === "warmup" && warmupDays.length) before.push(warmupDays[warmupDays.length - 1]);
  if (cur.key === "first_post") before.push(str(o.completed_at));
  const since = latest(before);
  const sinceMs = ms(since);
  const days = Number.isFinite(sinceMs) ? Math.max(0, Math.floor((now.getTime() - sinceMs) / DAY_MS)) : null;
  let stuck = false;
  const onCreator = cur.waitingOn === "creator" && cur.key !== "trial";
  if (onCreator && days !== null) {
    // Nobody posts on weekends, so the first posting day counts weekdays.
    stuck = cur.key === "first_post" ? weekdaysBetween(sinceMs, now.getTime()) >= STUCK_DAYS : days >= STUCK_DAYS;
  }
  return { steps: out, current: cur.key, currentSince: since, days, stuck };
}

/** The current step as one short phrase for list rows. */
export function progressStepSummary(p: CreatorProgress): ProgressStepSummary {
  const step = p.steps.find((s) => s.state === "current");
  if (!step) return { key: null, label: "Done", days: null, stuck: false, waitingOn: null };
  const short: Record<ProgressKey, string> = {
    accepted: "Accepting",
    welcome_email: "Welcome email",
    app_signed_in: "Signing in to the app",
    contract: "Contract",
    slack: "Slack",
    videos: "Videos",
    quiz: "Quiz",
    accounts: "Accounts",
    link: "Link in bio",
    rules: "Rules",
    warmup: "Warm-up",
    first_post: "First posting day",
    trial: "Trial",
  };
  let label = short[step.key];
  if (step.key === "warmup") {
    const done = Number((step.detail ?? "0").split(" ")[0]) || 0;
    label = `Warm-up day ${Math.min(done + 1, WARMUP_DAYS)} of ${WARMUP_DAYS}`;
  } else if (step.key === "trial" && step.detail?.startsWith("Day ")) {
    label = `Trial ${step.detail.replace(/^Day/, "day").replace(/, your call$/, "")}`;
  }
  return { key: step.key, label, days: p.days, stuck: p.stuck, waitingOn: step.waitingOn ?? null };
}
