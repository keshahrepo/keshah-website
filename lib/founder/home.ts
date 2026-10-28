/**
 * The founder app's Today tab: everything that needs the founder, plus the
 * three business numbers. Reads the same collections the web dashboard does.
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION, DEFAULT_TIMEZONE, mapCreatorStatus, onboardingSteps } from "@/lib/creators/db";
import { setupInputFromDoc, setupState } from "@/lib/creators/setup-deadline";
import { passwordsResetPending } from "@/lib/creators/offboard";
import { bankOnFile } from "@/lib/creators/payments";
import { localDateIn } from "@/lib/creators/time";
import { fmtMonthName } from "@/lib/creators/invoice-auto";
import { toAdminCreator } from "@/lib/creators/admin";
import { creatorProgress, progressStepSummary } from "@/lib/creators/progress";
import { deadlineOf, deadlineShort, isPastDue } from "@/lib/creators/deadline";
import { listAwaitingConversations } from "@/lib/support/repo";
import { groupConversations } from "@/lib/applicant-inbox";
import { listInboxMessages } from "@/lib/applicant-inbox-firestore";
import { revenueOverview, type RevenueOverview } from "@/lib/revenue";

export type NeedKind =
  | "trial_decision"
  | "deadline"
  | "setup"
  | "stuck"
  | "application"
  | "invoice_approve"
  | "invoice_pay"
  | "dispute"
  | "bonus_claim"
  | "day_off"
  | "tracking_link"
  | "bank_details"
  | "offboard_passwords"
  | "support"
  | "applicant_text";

export interface Need {
  kind: NeedKind;
  /** What to open: a creator id, an application id, or empty for a list. */
  id: string;
  title: string;
  subtitle: string;
  /** Sort key (ISO); oldest first within a kind. */
  at: string;
  /** invoice number / claim id / day-off date when the action needs it. */
  ref?: string;
  /** The creator's name when the title is a task ("Add Jen's tracking link"), for the page it opens. */
  name?: string;
}

export interface FounderHome {
  needs: Need[];
  revenue: RevenueOverview;
  counts: { creators_active: number; creators_trial: number; applications_open: number };
}

const toIso = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "toDate" in v) return (v as { toDate: () => Date }).toDate().toISOString();
  return "";
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** yyyy-mm-dd in the creator's timezone (falls back to New York). */
function localToday(tz: unknown, now: Date): string {
  try {
    return localDateIn(now, typeof tz === "string" && tz ? tz : DEFAULT_TIMEZONE);
  } catch {
    return localDateIn(now, DEFAULT_TIMEZONE);
  }
}

export async function founderHome(now = new Date()): Promise<FounderHome> {
  const { db } = getFirebaseAdmin();
  const needs: Need[] = [];

  const [creatorsSnap, offboardedSnap, appsSnap, support, revenue, inbox] = await Promise.all([
    db.collection(CREATORS_COLLECTION).where("is_active", "==", true).get(),
    db.collection(CREATORS_COLLECTION).where("offboard.passwords_reset_at", "==", null).get(),
    db.collection("careers_applications").where("status", "in", ["booked", "completed", "replied"]).get(),
    listAwaitingConversations({ limit: 1000 }).catch(() => []),
    revenueOverview(),
    listInboxMessages(db).then(groupConversations).catch(() => []),
  ]);

  // ---- creators: trial decisions, invoices, disputes, claims, days off
  let active = 0;
  let trial = 0;
  // Ended creators: the founder's "reset their passwords" task (they're often inactive after a Manage cut).
  for (const doc of offboardedSnap.docs) {
    const c = doc.data();
    if (!passwordsResetPending(c)) continue;
    const name = String(c.name || c.legal_name || "Creator");
    needs.push({
      kind: "offboard_passwords",
      id: doc.id,
      name,
      title: `Reset ${firstName(name)}'s TikTok and Instagram passwords`,
      subtitle: "And remove any phone number or two-factor",
      at: toIso(c.offboarded_at),
    });
  }
  await Promise.all(
    creatorsSnap.docs.map(async (doc) => {
      const c = doc.data();
      const name = String(c.name || c.legal_name || "Creator");
      // Day-off requests are dated in the creator's timezone.
      const today = localToday(c.timezone, now);
      if (c.status === "active") active++;
      if (c.status === "trial" || c.status === "onboarding") trial++;
      if (c.trial_plan === "v2" && c.status === "trial" && c.trial_completed_on && !c.trial_outcome) {
        needs.push({ kind: "trial_decision", id: doc.id, title: name, subtitle: "Finished the 20-day trial", at: String(c.trial_completed_on) });
      }
      const settingUp = ["onboarding", "trial"].includes(mapCreatorStatus(c.status));
      const [invs, claims, offs, onb] = await Promise.all([
        doc.ref.collection("invoices").where("status", "in", ["submitted", "approved"]).get(),
        doc.ref.collection("bonus_claims").where("status", "==", "claimed").get(),
        doc.ref.collection("days_off").where("status", "==", "requested").get(),
        settingUp ? doc.ref.collection("onboarding").doc("state").get() : null,
      ]);
      // Missed the 72-hour contract deadline (lib/creators/deadline.ts): never withdrawn
      // automatically; the creator page has "Give 48 more hours" and "Withdraw offer".
      const missed = settingUp && isPastDue(c, now);
      if (missed) {
        const dl = deadlineOf(c)!;
        needs.push({ kind: "deadline", id: doc.id, title: name, subtitle: `Didn't sign by ${deadlineShort(dl)}`, at: dl });
      }
      // Signed but didn't finish setup in 3 days (lib/creators/setup-deadline.ts): never ended
      // automatically; the creator page has "Give 3 more days" and "End agreement".
      let setupLate = false;
      if (settingUp && !missed && c.status === "onboarding" && !c.withdrawn_at) {
        const od = onb?.exists ? onb.data()! : null;
        const st = setupState(setupInputFromDoc(c, od, onboardingSteps(od, { contractSigned: c.contract?.status === "signed" })), now);
        if (st.overdue_days > 0 && st.due_date) {
          setupLate = true;
          const due = new Date(`${st.due_date}T12:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
          needs.push({ kind: "setup", id: doc.id, title: name, subtitle: `Didn't finish onboarding by ${due} · ${st.steps_left} step${st.steps_left === 1 ? "" : "s"} left`, at: st.due_date });
        }
      }
      // Stuck on a Progress step that's on them (lib/creators/progress.ts) for 2+ days.
      // The trial step is never stuck, so posting days aren't needed here.
      if (settingUp && !missed && !setupLate) {
        const a = toAdminCreator(doc.id, c);
        const p = creatorProgress(
          {
            status: a.status_display,
            acceptedAt: a.accepted_at,
            accept: a.accept,
            appFirstSignedInAt: a.app_first_signed_in_at,
            contract: a.contract,
            contractDeadlineAt: a.contract_deadline_at,
            withdrawnAt: a.withdrawn_at,
            onboarding: onb?.exists ? onb.data()! : null,
            trackingUrl: a.tracking_url,
            campaignTags: a.campaign_tags,
            startDate: a.start_date,
            trialPlan: a.trial_plan ?? null,
          },
          now,
        );
        if (p.stuck && p.days !== null) {
          const step = progressStepSummary(p).label.replace(/ day \d+ of \d+$/, "");
          needs.push({
            kind: "stuck",
            id: doc.id,
            title: name,
            subtitle: `Stuck on ${step} for ${p.days} day${p.days === 1 ? "" : "s"}`,
            at: p.currentSince ?? "",
          });
        }
      }
      // Accepted, still setting up, and no tracking link (or no campaign tag): their
      // posting can't start until the link is in their bio, and proceeds can't count.
      if (settingUp && c.accepted_at && !c.withdrawn_at) {
        const url = String(c.tracking_url ?? "").trim();
        const tags = Array.isArray(c.campaign_tags) ? c.campaign_tags.filter((t: unknown) => String(t ?? "").trim()) : [];
        if (!url || !tags.length) {
          needs.push({
            kind: "tracking_link",
            id: doc.id,
            name,
            title: !url ? `Add ${firstName(name)}'s tracking link` : `Add ${firstName(name)}'s campaign tag`,
            subtitle: !url ? "They can't start posting until it's in their bio" : "Their installs and proceeds won't count until it's set",
            at: toIso(c.accepted_at),
          });
        }
      }
      // An invoice is in but there's nowhere to send the money.
      const unpaid = invs.docs.filter((i) => Number(i.data().total_cents ?? 0) > 0);
      if (unpaid.length && !bankOnFile(c).on_file) {
        needs.push({
          kind: "bank_details",
          id: doc.id,
          name,
          title: `${firstName(name)} has no bank details`,
          subtitle: `Their ${fmtMonthName(String(unpaid[0].data().month ?? ""))} invoice is in, but there's nowhere to send it`,
          at: toIso(unpaid[0].data().submitted_at),
        });
      }
      for (const i of invs.docs) {
        const v = i.data();
        if (!Number(v.total_cents ?? 0)) continue; // a $0 invoice needs nothing from you
        const month = String(v.month ?? "");
        const total = Number(v.total_cents ?? 0);
        const money = `$${(total / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
        if (v.disputed_at && !v.dispute_resolved_at) {
          needs.push({ kind: "dispute", id: doc.id, ref: i.id, title: name, subtitle: `Disputed the ${month} invoice`, at: toIso(v.disputed_at) });
        } else if (v.status === "submitted") {
          needs.push({ kind: "invoice_approve", id: doc.id, ref: i.id, title: name, subtitle: `${month} invoice · ${money}`, at: toIso(v.submitted_at) });
        } else {
          needs.push({ kind: "invoice_pay", id: doc.id, ref: i.id, title: name, subtitle: `Pay ${money} for ${month}`, at: toIso(v.approved_at) });
        }
      }
      for (const b of claims.docs) {
        const v = b.data();
        needs.push({ kind: "bonus_claim", id: doc.id, ref: b.id, title: name, subtitle: `Bonus claim · ${v.platform === "tiktok" ? "TikTok" : "Instagram"}`, at: toIso(v.created_at) || String(v.posted_on ?? "") });
      }
      for (const o of offs.docs) {
        const v = o.data();
        const date = String(v.date ?? o.id);
        if (date < today) continue;
        needs.push({ kind: "day_off", id: doc.id, ref: date, title: name, subtitle: `Day off ${date}${v.reason ? ` · ${String(v.reason).slice(0, 60)}` : ""}`, at: toIso(v.requested_at) || date });
      }
    }),
  );

  // ---- applications that had their interview (video in, or the call is over)
  let open = 0;
  for (const d of appsSnap.docs) {
    const a = d.data();
    // Only the TikTok outreach pipeline (the old applications channel is closed).
    if (a.source !== "tiktok-outreach") continue;
    open++;
    if (a.status === "replied" && !a.interview_video_submitted_at) {
      // Replied: waiting on your calendar.
      needs.push({
        kind: "application",
        id: d.id,
        title: String(a.full_name || "Creator"),
        subtitle: "Replied. Send your calendar",
        at: typeof a.replied_at === "string" ? a.replied_at : toIso(a.last_updated_at),
      });
      continue;
    }
    // Only creators who've submitted their test video can be decided.
    if (a.interview_video_submitted_at) {
      needs.push({
        kind: "application",
        id: d.id,
        title: String(a.full_name || "Applicant"),
        subtitle: "Test video in",
        at: toIso(a.interview_video_submitted_at) || toIso(a.last_updated_at),
      });
    }
  }

  // ---- support drafts and applicant texts (one row each)
  if (support.length) {
    needs.push({ kind: "support", id: "", title: "Support", subtitle: `${support.length} repl${support.length === 1 ? "y" : "ies"} waiting`, at: "" });
  }
  // Applicant texts belonged to the old applications channel: no longer listed.
  void inbox;

  const order: NeedKind[] = [
    "trial_decision",
    "deadline",
    "setup",
    "dispute",
    "application",
    "tracking_link",
    "stuck",
    "invoice_approve",
    "bank_details",
    "invoice_pay",
    "day_off",
    "bonus_claim",
    "offboard_passwords",
    "applicant_text",
    "support",
  ];
  needs.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind) || x.at.localeCompare(y.at));
  return { needs, revenue, counts: { creators_active: active, creators_trial: trial, applications_open: open } };
}
