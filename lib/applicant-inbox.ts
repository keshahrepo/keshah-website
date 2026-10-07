// Applicant text inbox: pure logic, no Firestore. The Firestore side lives in
// applicant-inbox-firestore.ts; tests use an in-memory store
// (applicant-inbox.test.ts).
//
// HiBlue posts every webhook event for our one line to a Cloud Function that
// stores it in _HiBlueWebhookEvents {payload, received_at, ...}. Replies come
// in two shapes, usually both for the same message:
//   nested: payload.event (or .type) === "incoming_message", fields in payload.data
//   flat:   no event/type, fields (phone, message, message_id, ...) on payload
// Delivery receipts ("delivery_status") and anything else are ignored.
//
// The same line also carries paywall outreach to app users. Only replies
// whose phone matches a careers_applications phone are kept, so app users
// never show up in the applicant inbox.

import { normalizePhone } from "./sms";

export const APPLICANT_MESSAGES = "applicant_messages";
export const HIBLUE_EVENTS = "_HiBlueWebhookEvents";
export const INBOX_SETTINGS_DOC = "applicant_inbox"; // Settings/applicant_inbox
export const INBOX_URL = "https://www.keshah.com/dashboard/applications?inbox=1";

/** Statuses that count as "not active" when several applications share a phone. */
const INACTIVE = new Set(["denied", "rejected", "withdrawn"]);

export type IncomingText = {
  event_id: string;
  received_ms: number;
  phone: string; // E.164
  text: string;
  attachments: string[];
  thread_id: string | null;
  message_id: string | null;
};

export type WebhookEvent = { id: string; received_ms: number; payload: unknown };

export type AppLite = {
  id: string;
  phone: unknown;
  status: string | null;
  full_name: string | null;
  updated_ms: number;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** The incoming text in a webhook event, or null for anything else. */
export function parseIncoming(ev: WebhookEvent): IncomingText | null {
  const p = asRecord(ev.payload);
  if (!p) return null;
  const kind = (p.type ?? p.event) as unknown;
  let m: Record<string, unknown> | null = null;
  if (kind === "incoming_message") m = asRecord(p.data) ?? p;
  else if (kind === undefined || kind === null || kind === "") {
    // Flat shape: must look like a message, not a receipt.
    if ("message" in p && "phone" in p && ("contact_id" in p || "thread_id" in p || "message_id" in p)) m = p;
  }
  if (!m) return null;
  const phone = normalizePhone(typeof m.phone === "string" ? m.phone : "");
  if (!phone) return null;
  const text = typeof m.message === "string" ? m.message : "";
  const attachments = Array.isArray(m.attachments)
    ? m.attachments
        .map((a) => (typeof a === "string" ? a : String(asRecord(a)?.url ?? "")))
        .filter((a) => !!a)
    : [];
  if (!text.trim() && attachments.length === 0) return null;
  const tid = m.thread_id;
  const mid = m.message_id;
  return {
    event_id: ev.id,
    received_ms: ev.received_ms,
    phone,
    text,
    attachments,
    thread_id: tid === undefined || tid === null || tid === "" ? null : String(tid),
    message_id: typeof mid === "string" && mid ? mid : null,
  };
}

/**
 * Doc id for an inbound message. Keyed by HiBlue's message_id when present,
 * so the nested and flat copies of the same reply land on one doc; else by
 * the webhook event id.
 */
export function inboundDocId(m: IncomingText): string {
  const key = m.message_id ? `m_${m.message_id}` : `e_${m.event_id}`;
  return `in_${key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300)}`;
}

/** Phone (E.164) -> the application a reply from that phone belongs to. */
export function buildPhoneIndex(apps: AppLite[]): Map<string, AppLite> {
  const byPhone = new Map<string, AppLite[]>();
  for (const a of apps) {
    const p = normalizePhone(a.phone);
    if (!p) continue;
    const list = byPhone.get(p) ?? [];
    list.push(a);
    byPhone.set(p, list);
  }
  const out = new Map<string, AppLite>();
  for (const [p, list] of byPhone) out.set(p, pickApplication(list)!);
  return out;
}

/** Most recently updated active application; if none are active, the most recent. */
export function pickApplication(list: AppLite[]): AppLite | null {
  if (!list.length) return null;
  const byRecent = [...list].sort((a, b) => b.updated_ms - a.updated_ms);
  return byRecent.find((a) => !INACTIVE.has(String(a.status ?? ""))) ?? byRecent[0];
}

export function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case "pending":
      return "Pending (did not finish the form)";
    case "awaiting_booking":
    case "completed":
      return "Awaiting booking";
    case "booked":
      return "Booked";
    case "accepted":
      return "Accepted";
    case "denied":
      return "Denied";
    default:
      return status || "Unknown";
  }
}

export function notificationEmail(app: AppLite, texts: IncomingText[]): { subject: string; text: string } {
  const name = (app.full_name ?? "").trim() || "An applicant";
  const lines = texts.map((t) => {
    const body = t.text.trim() || "(no text)";
    const att = t.attachments.length ? `\n(${t.attachments.length} attachment${t.attachments.length > 1 ? "s" : ""})` : "";
    return `${body}${att}`;
  });
  return {
    subject: `${name} replied by text`,
    text:
      `${name} sent ${texts.length > 1 ? `${texts.length} texts` : "a text"}:\n\n` +
      lines.join("\n\n") +
      `\n\nApplication status: ${statusLabel(app.status)}\n\n` +
      `Open the inbox to reply:\n${INBOX_URL}\n`,
  };
}

// ------------------------------------------------------------------ sync

export type InboxCursor = { received_ms: number; event_id: string | null };

export type InboundRecord = {
  application_id: string;
  phone: string;
  direction: "in";
  text: string;
  attachments: string[];
  thread_id: string | null;
  received_ms: number;
  read: false;
  hiublue_event_id: string;
  hiublue_message_id: string | null;
};

export interface InboxStore {
  getCursor(): Promise<InboxCursor | null>;
  setCursor(c: InboxCursor): Promise<void>;
  /** Events with received_at >= sinceMs, oldest first. */
  listEventsSince(sinceMs: number, limit: number): Promise<WebhookEvent[]>;
  listApplications(): Promise<AppLite[]>;
  /** Creates the doc; false when it already exists. */
  createMessageIfAbsent(id: string, rec: InboundRecord): Promise<boolean>;
  markNotified(ids: string[], info: { ok: boolean; error?: string }): Promise<void>;
}

export type SyncResult = {
  scanned: number;
  incoming: number;
  matched: number;
  created: number;
  notified: number;
  cursor: InboxCursor | null;
  backfill: boolean;
  errors: string[];
};

export const SYNC_PAGE = 300;
const MAX_PAGES = 10;
/** Replies older than this when first seen are stored but not emailed about. */
export const NOTIFY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Pull new replies since the cursor into applicant_messages and email one
 * notice per applicant per run. Idempotent: rerunning over the same events
 * creates nothing and sends nothing.
 *
 * The very first run (no cursor yet) backfills all history quietly: messages
 * are stored but no emails go out. Replies older than NOTIFY_MAX_AGE_MS are
 * never emailed about either.
 */
export async function syncApplicantInbox(
  store: InboxStore,
  opts: {
    notify?: (app: AppLite, texts: IncomingText[]) => Promise<void>;
    /** Runs once per newly stored reply (e.g. interview check-in). Errors are reported, not thrown. */
    onNewReply?: (app: AppLite, text: IncomingText, nowMs: number) => Promise<void>;
    pageSize?: number;
    nowMs?: number;
  } = {},
): Promise<SyncResult> {
  const pageSize = opts.pageSize ?? SYNC_PAGE;
  const nowMs = opts.nowMs ?? Date.now();
  const start = await store.getCursor();
  const backfill = start === null;
  let cursor: InboxCursor = start ?? { received_ms: 0, event_id: null };
  const res: SyncResult = { scanned: 0, incoming: 0, matched: 0, created: 0, notified: 0, cursor: start, backfill, errors: [] };
  let index: Map<string, AppLite> | null = null;
  const fresh = new Map<string, { app: AppLite; texts: IncomingText[]; ids: string[] }>();

  // Backfill runs to the end so the next run never mails old history.
  for (let page = 0; backfill || page < MAX_PAGES; page++) {
    const events = await store.listEventsSince(cursor.received_ms, pageSize);
    // >= keeps events that share the cursor's millisecond; skip the one we
    // already finished.
    const todo = events.filter((e) => !(e.received_ms === cursor.received_ms && e.id === cursor.event_id));
    if (!todo.length) break;
    const before = cursor.received_ms;
    for (const ev of todo) {
      res.scanned++;
      const m = parseIncoming(ev);
      if (m) {
        res.incoming++;
        index ??= buildPhoneIndex(await store.listApplications());
        const app = index.get(m.phone);
        if (app) {
          res.matched++;
          const id = inboundDocId(m);
          const created = await store.createMessageIfAbsent(id, {
            application_id: app.id,
            phone: m.phone,
            direction: "in",
            text: m.text,
            attachments: m.attachments,
            thread_id: m.thread_id,
            received_ms: m.received_ms,
            read: false,
            hiublue_event_id: m.event_id,
            hiublue_message_id: m.message_id,
          });
          if (created) {
            res.created++;
            if (opts.onNewReply) {
              try {
                await opts.onNewReply(app, m, nowMs);
              } catch (e) {
                res.errors.push(`reply hook ${app.id}: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
          }
          if (created && nowMs - m.received_ms <= NOTIFY_MAX_AGE_MS) {
            const g = fresh.get(app.id) ?? { app, texts: [], ids: [] };
            g.texts.push(m);
            g.ids.push(id);
            fresh.set(app.id, g);
          }
        }
      }
      cursor = { received_ms: ev.received_ms, event_id: ev.id };
    }
    await store.setCursor(cursor);
    res.cursor = cursor;
    if (events.length < pageSize) break;
    // A full page inside one millisecond would loop forever; stop instead.
    if (cursor.received_ms === before) break;
  }

  if (!backfill && opts.notify) {
    for (const g of fresh.values()) {
      try {
        await opts.notify(g.app, g.texts);
        res.notified += g.texts.length;
        await store.markNotified(g.ids, { ok: true }).catch(() => {});
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.errors.push(`notify ${g.app.id}: ${msg}`);
        await store.markNotified(g.ids, { ok: false, error: msg }).catch(() => {});
      }
    }
  }
  return res;
}

// ------------------------------------------------------------------ inbox views

export type InboxMessage = {
  id: string;
  application_id: string;
  direction: "in" | "out";
  text: string;
  attachments: string[];
  at_ms: number;
  read: boolean;
  kind: string | null;
};

export type Conversation = {
  application_id: string;
  last_text: string;
  last_direction: "in" | "out";
  last_at_ms: number;
  unread: number;
  has_inbound: boolean;
};

/** Group messages into conversations, newest activity first. */
export function groupConversations(msgs: InboxMessage[]): Conversation[] {
  const by = new Map<string, Conversation>();
  for (const m of msgs) {
    const c = by.get(m.application_id) ?? {
      application_id: m.application_id,
      last_text: "",
      last_direction: m.direction,
      last_at_ms: -1,
      unread: 0,
      has_inbound: false,
    };
    if (m.at_ms > c.last_at_ms) {
      c.last_at_ms = m.at_ms;
      c.last_direction = m.direction;
      c.last_text = m.text.trim() || (m.attachments.length ? "(attachment)" : "");
    }
    if (m.direction === "in") {
      c.has_inbound = true;
      if (!m.read) c.unread++;
    }
    by.set(m.application_id, c);
  }
  return [...by.values()].sort((a, b) => b.last_at_ms - a.last_at_ms);
}
