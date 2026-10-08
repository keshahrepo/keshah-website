// Firestore side of the applicant text inbox (see applicant-inbox.ts).
//
//   applicant_messages/{id}   one text, in or out
//     out: {application_id, phone, direction:"out", text, message_id, sent_at, kind, at}
//     in:  {application_id, phone, direction:"in", text, attachments, thread_id,
//           received_at, read, hiublue_event_id, hiublue_message_id, at}
//     `at` is sent_at / received_at copied to one field so a thread sorts on it.
//   Settings/applicant_inbox  {last_event_received_at, last_event_id}

import { notifyFounder } from "@/lib/staff";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "./firebase-admin";
import { emailConfigured, sendEmail } from "./email";
import {
  APPLICANT_MESSAGES,
  HIBLUE_EVENTS,
  INBOX_SETTINGS_DOC,
  notificationEmail,
  syncApplicantInbox,
  type AppLite,
  type InboxMessage,
  type InboxStore,
  type IncomingText,
  type SyncResult,
} from "./applicant-inbox";
import { sendInterviewText, textWasSent, type OutboundTextRecord } from "./sms";
import { claimOnce } from "./interview";
import {
  CHECKED_IN_FIELD,
  CHECKED_IN_FOR_FIELD,
  CHECKIN_REPLY_TEXT_FIELD,
  CHECKIN_TEXT_SENT_FIELD,
  checkInDue,
  checkInReplyText,
  firstNameOf,
  formatShortTime,
  looksLikeCheckIn,
} from "./interview-reminders";

const APPLICATIONS = "careers_applications";
export const INBOX_FROM_NAME = "KESHAH Dashboard";

function tsMs(v: unknown): number {
  if (v && typeof v === "object" && "toMillis" in (v as object)) return (v as { toMillis: () => number }).toMillis();
  if (typeof v === "string") return Date.parse(v) || 0;
  if (typeof v === "number") return v;
  return 0;
}

export async function logOutboundText(rec: OutboundTextRecord, db: Firestore = getFirebaseAdmin().db): Promise<void> {
  const now = Timestamp.now();
  await db.collection(APPLICANT_MESSAGES).add({
    application_id: rec.application_id,
    phone: rec.phone,
    direction: "out",
    text: rec.text,
    message_id: rec.message_id,
    sent_at: now,
    at: now,
    kind: rec.kind,
  });
}

export function firestoreInboxStore(db: Firestore): InboxStore {
  const settings = db.collection("Settings").doc(INBOX_SETTINGS_DOC);
  return {
    async getCursor() {
      const s = await settings.get();
      const x = s.data();
      if (!x || x.last_event_received_at === undefined) return null;
      return { received_ms: tsMs(x.last_event_received_at), event_id: (x.last_event_id as string) ?? null };
    },
    async setCursor(c) {
      await settings.set(
        { last_event_received_at: Timestamp.fromMillis(c.received_ms), last_event_id: c.event_id, updated_at: FieldValue.serverTimestamp() },
        { merge: true },
      );
    },
    async listEventsSince(sinceMs, limit) {
      const snap = await db
        .collection(HIBLUE_EVENTS)
        .where("received_at", ">=", Timestamp.fromMillis(sinceMs))
        .orderBy("received_at", "asc")
        .limit(limit)
        .get();
      return snap.docs.map((d) => ({ id: d.id, received_ms: tsMs(d.get("received_at")), payload: d.get("payload") }));
    },
    async listApplications() {
      const snap = await db.collection(APPLICATIONS).select("phone", "status", "full_name", "last_updated_at", "created_at").get();
      return snap.docs.map((d) => ({
        id: d.id,
        phone: d.get("phone"),
        status: (d.get("status") as string) ?? null,
        full_name: (d.get("full_name") as string) ?? null,
        updated_ms: tsMs(d.get("last_updated_at")) || tsMs(d.get("created_at")),
      }));
    },
    async isPaywallConversation(phone, receivedMs) {
      const before = Timestamp.fromMillis(receivedMs);
      const paywall = await db.collection("_HiBlueOutreachQueue").where("phone", "==", phone).get();
      let paywallMs = 0;
      for (const d of paywall.docs) {
        const t = tsMs(d.get("sent_at"));
        if (t && t <= receivedMs && t > paywallMs) paywallMs = t;
      }
      if (!paywallMs) return false;
      const ours = await db.collection(APPLICANT_MESSAGES).where("phone", "==", phone).where("direction", "==", "out").get();
      let oursMs = 0;
      for (const d of ours.docs) {
        const t = tsMs(d.get("sent_at") ?? d.get("at"));
        if (t && t <= before.toMillis() && t > oursMs) oursMs = t;
      }
      return paywallMs > oursMs;
    },
    async createMessageIfAbsent(id, rec) {
      const { received_ms, ...rest } = rec;
      const at = Timestamp.fromMillis(received_ms);
      try {
        await db.collection(APPLICANT_MESSAGES).doc(id).create({ ...rest, received_at: at, at });
        return true;
      } catch (e) {
        if ((e as { code?: number }).code === 6) return false; // ALREADY_EXISTS
        throw e;
      }
    },
    async markNotified(ids, info) {
      const batch = db.batch();
      for (const id of ids) {
        batch.set(
          db.collection(APPLICANT_MESSAGES).doc(id),
          info.ok ? { notified_at: FieldValue.serverTimestamp() } : { notify_error: info.error ?? "failed" },
          { merge: true },
        );
      }
      await batch.commit();
    },
  };
}

/** Email contact@ about new applicant replies. No-op when email isn't set up. */
async function emailNotify(app: AppLite, texts: Parameters<typeof notificationEmail>[1]): Promise<void> {
  await notifyFounder({ title: app.full_name ? `Text from ${app.full_name}` : "Applicant text", body: String(texts[texts.length - 1]?.text ?? "").slice(0, 140), data: { type: "founder_applicant_text", id: app.id } });
  if (!emailConfigured()) throw new Error("email not configured");
  const to = process.env.KESHAH_GMAIL_USER!;
  await sendEmail({ to, fromName: INBOX_FROM_NAME, ...notificationEmail(app, texts) });
}

/**
 * A reply to the 1h text that looks like a check-in (their name, or a short
 * yes/here) checks the applicant in (once per booking) and gets the join link
 * back. Anything else is left unread in the inbox (and emailed) for a person. Claimed in a transaction so overlapping syncs can't
 * double send.
 */
export async function handleCheckIn(
  db: Firestore,
  app: AppLite,
  reply: IncomingText,
  nowMs: number,
  send: typeof sendInterviewText = sendInterviewText,
): Promise<"checked_in" | "skipped"> {
  const ref = db.collection(APPLICATIONS).doc(app.id);
  let snapshot: Record<string, unknown> = {};
  const won = await claimOnce(db, ref, (cur) => {
    if (!checkInDue(cur, reply.received_ms, nowMs)) return null;
    // Questions and anything else stay in the inbox for a person to answer.
    if (!looksLikeCheckIn(reply.text, cur.full_name)) return null;
    snapshot = cur;
    return {
      [CHECKED_IN_FIELD]: Timestamp.fromMillis(reply.received_ms),
      [CHECKED_IN_FOR_FIELD]: cur.calendly_event_start_time,
      [CHECKIN_REPLY_TEXT_FIELD]: reply.text.slice(0, 500),
    };
  });
  if (!won) return "skipped";
  const startMs = Date.parse(String(snapshot.calendly_event_start_time));
  const text = checkInReplyText(
    firstNameOf(snapshot),
    formatShortTime(startMs, snapshot.calendly_invitee_timezone),
    (snapshot.calendly_join_url as string) || null,
  );
  const r = await send({ to: reply.phone, text, ref: app.id, kind: "checkin_reply" });
  if (textWasSent(r)) {
    await ref.set({ [CHECKIN_TEXT_SENT_FIELD]: Timestamp.now() }, { merge: true });
  } else {
    // Stay checked in; the reply won't come round again, so say why in the doc.
    const why = "error" in r ? r.error : "skipped" in r ? r.skipped : "not sent";
    await ref.set({ interview_checkin_text_error: why }, { merge: true });
    throw new Error(`check-in reply not sent: ${why}`);
  }
  return "checked_in";
}

export async function runApplicantInboxSync(db: Firestore = getFirebaseAdmin().db): Promise<SyncResult> {
  return syncApplicantInbox(firestoreInboxStore(db), {
    notify: emailNotify,
    onNewReply: async (app, reply, nowMs) => {
      await handleCheckIn(db, app, reply, nowMs);
    },
  });
}

function toMessage(d: FirebaseFirestore.QueryDocumentSnapshot): InboxMessage {
  const x = d.data();
  return {
    id: d.id,
    application_id: String(x.application_id ?? ""),
    direction: x.direction === "in" ? "in" : "out",
    text: typeof x.text === "string" ? x.text : "",
    attachments: Array.isArray(x.attachments) ? x.attachments.filter((a: unknown) => typeof a === "string") : [],
    at_ms: tsMs(x.at) || tsMs(x.received_at) || tsMs(x.sent_at),
    read: x.direction !== "in" || x.read === true,
    kind: (x.kind as string) ?? null,
  };
}

export async function listInboxMessages(db: Firestore, limit = 2000): Promise<InboxMessage[]> {
  const snap = await db.collection(APPLICANT_MESSAGES).orderBy("at", "desc").limit(limit).get();
  return snap.docs.map(toMessage).filter((m) => m.application_id);
}

export async function listThread(db: Firestore, applicationId: string): Promise<InboxMessage[]> {
  const snap = await db.collection(APPLICANT_MESSAGES).where("application_id", "==", applicationId).get();
  return snap.docs.map(toMessage).sort((a, b) => a.at_ms - b.at_ms);
}

export async function markThreadRead(db: Firestore, applicationId: string): Promise<number> {
  const snap = await db.collection(APPLICANT_MESSAGES).where("application_id", "==", applicationId).get();
  const unread = snap.docs.filter((d) => d.get("direction") === "in" && d.get("read") !== true);
  if (!unread.length) return 0;
  const batch = db.batch();
  for (const d of unread) batch.update(d.ref, { read: true, read_at: FieldValue.serverTimestamp() });
  await batch.commit();
  return unread.length;
}
