/**
 * The founder app's Today tab: everything that needs the founder, plus the
 * three business numbers. Reads the same collections the web dashboard does.
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION } from "@/lib/creators/db";
import { listAwaitingConversations } from "@/lib/support/repo";
import { groupConversations } from "@/lib/applicant-inbox";
import { listInboxMessages } from "@/lib/applicant-inbox-firestore";
import { revenueOverview, type RevenueOverview } from "@/lib/revenue";

export type NeedKind =
  | "trial_decision"
  | "application"
  | "invoice_approve"
  | "invoice_pay"
  | "dispute"
  | "bonus_claim"
  | "day_off"
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

export async function founderHome(now = new Date()): Promise<FounderHome> {
  const { db } = getFirebaseAdmin();
  const needs: Need[] = [];
  const today = now.toISOString().slice(0, 10);

  const [creatorsSnap, appsSnap, support, revenue, inbox] = await Promise.all([
    db.collection(CREATORS_COLLECTION).where("is_active", "==", true).get(),
    db.collection("careers_applications").where("status", "in", ["booked", "completed", "awaiting_booking", "pending"]).get(),
    listAwaitingConversations({ limit: 100 }).catch(() => []),
    revenueOverview(),
    listInboxMessages(db).then(groupConversations).catch(() => []),
  ]);

  // ---- creators: trial decisions, invoices, disputes, claims, days off
  let active = 0;
  let trial = 0;
  await Promise.all(
    creatorsSnap.docs.map(async (doc) => {
      const c = doc.data();
      const name = String(c.name || c.legal_name || "Creator");
      if (c.status === "active") active++;
      if (c.status === "trial" || c.status === "onboarding") trial++;
      if (c.trial_plan === "v2" && c.status === "trial" && c.trial_completed_on && !c.trial_outcome) {
        needs.push({ kind: "trial_decision", id: doc.id, title: name, subtitle: "Finished the 20-day trial", at: String(c.trial_completed_on) });
      }
      const [invs, claims, offs] = await Promise.all([
        doc.ref.collection("invoices").where("status", "in", ["submitted", "approved"]).get(),
        doc.ref.collection("bonus_claims").where("status", "==", "claimed").get(),
        doc.ref.collection("days_off").where("status", "==", "requested").get(),
      ]);
      for (const i of invs.docs) {
        const v = i.data();
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
    open++;
    // Only applicants who've submitted their interview video can be decided.
    if (a.interview_video_submitted_at) {
      needs.push({
        kind: "application",
        id: d.id,
        title: String(a.full_name || "Applicant"),
        subtitle: "Interview video in",
        at: toIso(a.interview_video_submitted_at) || toIso(a.last_updated_at),
      });
    }
  }

  // ---- support drafts and applicant texts (one row each)
  if (support.length) {
    needs.push({ kind: "support", id: "", title: "Support", subtitle: `${support.length} repl${support.length === 1 ? "y" : "ies"} waiting`, at: "" });
  }
  const unread = inbox.filter((c) => c.unread > 0);
  for (const c of unread.slice(0, 10)) {
    needs.push({ kind: "applicant_text", id: c.application_id, title: "Applicant text", subtitle: c.last_text.slice(0, 80), at: c.last_at_ms > 0 ? new Date(c.last_at_ms).toISOString() : "" });
  }

  const order: NeedKind[] = ["trial_decision", "dispute", "application", "invoice_approve", "invoice_pay", "day_off", "bonus_claim", "applicant_text", "support"];
  needs.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind) || x.at.localeCompare(y.at));
  return { needs, revenue, counts: { creators_active: active, creators_trial: trial, applications_open: open } };
}
