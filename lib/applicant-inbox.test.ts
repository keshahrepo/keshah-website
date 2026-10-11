// Run: npx tsx --test lib/applicant-inbox.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPhoneIndex,
  groupConversations,
  inboundDocId,
  notificationEmail,
  parseIncoming,
  pickApplication,
  syncApplicantInbox,
  type AppLite,
  type InboundRecord,
  type InboxCursor,
  type InboxStore,
  type WebhookEvent,
} from "./applicant-inbox";
import { sendInterviewText, type OutboundTextRecord } from "./sms";
import { handleCheckIn } from "./applicant-inbox-firestore";
import type { Firestore } from "firebase-admin/firestore";

const T0 = Date.parse("2026-10-07T12:00:00.000Z");
const APPLICANT = "+12125550101";
const APP_USER = "+13105550199"; // paywall outreach contact, not an applicant

function nested(id: string, ms: number, phone: string, message: string, messageId = `mid-${id}`): WebhookEvent {
  return {
    id,
    received_ms: ms,
    payload: {
      event: "incoming_message",
      timestamp: new Date(ms).toISOString(),
      data: { phone, message, message_id: messageId, thread_id: 77, attachments: [], channel: "iMessage", contact_id: "c", location_id: "keshah-app", line_phone: "+13473312820" },
    },
  };
}
function flat(id: string, ms: number, phone: string, message: string, messageId = `mid-${id}`): WebhookEvent {
  return {
    id,
    received_ms: ms,
    payload: { phone, message, message_id: messageId, thread_id: 77, attachments: [], channel: "iMessage", contact_id: "c", location_id: "keshah-app", line_phone: "+13473312820" },
  };
}
function receipt(id: string, ms: number): WebhookEvent {
  return { id, received_ms: ms, payload: { event: "delivery_status", data: { status: "delivered", messageId: "x", sender: "+13473312820" } } };
}

class MemStore implements InboxStore {
  cursor: InboxCursor | null = null;
  events: WebhookEvent[] = [];
  apps: AppLite[] = [];
  messages = new Map<string, InboundRecord & { notified?: boolean }>();
  appLoads = 0;
  async getCursor() {
    return this.cursor;
  }
  async setCursor(c: InboxCursor) {
    this.cursor = c;
  }
  async listEventsSince(ms: number, limit: number) {
    return this.events
      .filter((e) => e.received_ms >= ms)
      .sort((a, b) => a.received_ms - b.received_ms)
      .slice(0, limit);
  }
  async listApplications() {
    this.appLoads++;
    return this.apps;
  }
  async createMessageIfAbsent(id: string, rec: InboundRecord) {
    if (this.messages.has(id)) return false;
    this.messages.set(id, rec);
    return true;
  }
  async markNotified(ids: string[]) {
    for (const id of ids) this.messages.get(id)!.notified = true;
  }
}

function app(id: string, phone: string, status: string, updated: number, full_name = "Jamie Rivera"): AppLite {
  return { id, phone, status, full_name, updated_ms: updated };
}

// ------------------------------------------------------------ parsing / phones

test("parseIncoming reads nested and flat replies and ignores receipts", () => {
  const n = parseIncoming(nested("e1", T0, "(212) 555-0101", "yes I can make it"));
  assert.equal(n?.phone, APPLICANT);
  assert.equal(n?.text, "yes I can make it");
  assert.equal(n?.thread_id, "77");
  const f = parseIncoming(flat("e2", T0, "212.555.0101", "hi"));
  assert.equal(f?.phone, APPLICANT);
  assert.equal(parseIncoming(receipt("e3", T0)), null);
  assert.equal(parseIncoming({ id: "e4", received_ms: T0, payload: { event: "connection_test", data: { marker: "x" } } }), null);
  // type field (older shape) works too
  assert.equal(parseIncoming({ id: "e5", received_ms: T0, payload: { type: "incoming_message", phone: "+12125550101", message: "ok" } })?.phone, APPLICANT);
});

test("nested and flat copies of one reply share a doc id", () => {
  const a = parseIncoming(nested("e1", T0, APPLICANT, "hi", "ABC-1"))!;
  const b = parseIncoming(flat("e2", T0 + 5000, APPLICANT, "hi", "ABC-1"))!;
  assert.equal(inboundDocId(a), inboundDocId(b));
  const c = parseIncoming({ id: "evt/9", received_ms: T0, payload: { event: "incoming_message", data: { phone: APPLICANT, message: "x" } } })!;
  assert.equal(inboundDocId(c), "in_e_evt_9");
});

test("phone index normalizes free-text phones and prefers the newest active application", () => {
  const idx = buildPhoneIndex([
    app("old", "212-555-0101", "booked", 1),
    app("new-denied", "+1 212 555 0101", "denied", 3),
    app("new-active", "1 (212) 555-0101", "awaiting_booking", 2),
    app("bad", "call me", "booked", 9),
  ]);
  assert.equal(idx.get(APPLICANT)?.id, "new-active");
  assert.equal(idx.size, 1);
  assert.equal(pickApplication([app("a", APPLICANT, "denied", 1), app("b", APPLICANT, "denied", 5)])?.id, "b");
});

// ------------------------------------------------------------ sync

test("sync stores applicant replies only; paywall/app-user replies are excluded", async () => {
  const s = new MemStore();
  s.cursor = { received_ms: T0 - 1, event_id: null };
  s.apps = [app("app1", "(212) 555-0101", "booked", 1)];
  s.events = [nested("e1", T0, APPLICANT, "see you then"), nested("e2", T0 + 1, APP_USER, "cancel my trial"), receipt("e3", T0 + 2)];
  const sent: Array<{ app: string; n: number; subject: string; body: string }> = [];
  const r = await syncApplicantInbox(s, {
    nowMs: T0 + 60_000,
    notify: async (a, texts) => {
      const e = notificationEmail(a, texts);
      sent.push({ app: a.id, n: texts.length, subject: e.subject, body: e.text });
    },
  });
  assert.equal(r.incoming, 2);
  assert.equal(r.matched, 1);
  assert.equal(r.created, 1);
  assert.equal(s.messages.size, 1);
  const msg = [...s.messages.values()][0];
  assert.equal(msg.application_id, "app1");
  assert.equal(msg.direction, "in");
  assert.equal(msg.read, false);
  assert.equal(msg.hiublue_event_id, "e1");
  assert.ok(![...s.messages.values()].some((m) => m.phone === APP_USER));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, "Jamie Rivera replied by text");
  assert.match(sent[0].body, /see you then/);
  assert.match(sent[0].body, /Application status: Booked/);
  assert.match(sent[0].body, /dashboard\/applications\?inbox=1/);
  assert.doesNotMatch(sent[0].body + sent[0].subject, /—/);
  assert.equal(msg.notified, true);
});

test("sync is idempotent: reruns and duplicate shapes create and email nothing new", async () => {
  const s = new MemStore();
  s.cursor = { received_ms: 0, event_id: null };
  s.apps = [app("app1", APPLICANT, "booked", 1)];
  s.events = [nested("e1", T0, APPLICANT, "hello", "M1"), flat("e2", T0 + 3, APPLICANT, "hello", "M1")];
  let mails = 0;
  const notify = async () => {
    mails++;
  };
  const r1 = await syncApplicantInbox(s, { notify, nowMs: T0 + 10 });
  assert.equal(r1.created, 1);
  assert.equal(mails, 1);
  // Replay from scratch (cursor reset): nothing new.
  s.cursor = { received_ms: 0, event_id: null };
  const r2 = await syncApplicantInbox(s, { notify, nowMs: T0 + 10 });
  assert.equal(r2.created, 0);
  assert.equal(mails, 1);
  assert.equal(s.messages.size, 1);
});

test("cursor advances past every event (matched or not) and later runs only see new ones", async () => {
  const s = new MemStore();
  s.cursor = { received_ms: T0 - 1000, event_id: null };
  s.apps = [app("app1", APPLICANT, "booked", 1)];
  s.events = [receipt("e1", T0), nested("e2", T0 + 10, APP_USER, "x"), receipt("e3", T0 + 20)];
  const r1 = await syncApplicantInbox(s, { nowMs: T0 });
  assert.deepEqual(s.cursor, { received_ms: T0 + 20, event_id: "e3" });
  assert.equal(r1.scanned, 3);

  // Nothing new: the event sitting on the cursor is skipped, apps not loaded.
  s.appLoads = 0;
  const r2 = await syncApplicantInbox(s, { nowMs: T0 });
  assert.equal(r2.scanned, 0);
  assert.equal(s.appLoads, 0);

  // A new event in the same millisecond as the cursor still gets picked up.
  s.events.push(nested("e4", T0 + 20, APPLICANT, "same ms"));
  const r3 = await syncApplicantInbox(s, { nowMs: T0 + 30 });
  assert.equal(r3.scanned, 1);
  assert.equal(r3.created, 1);
  assert.deepEqual(s.cursor, { received_ms: T0 + 20, event_id: "e4" });
});

test("cursor pages through more events than one page", async () => {
  const s = new MemStore();
  s.cursor = { received_ms: 0, event_id: null };
  s.apps = [app("app1", APPLICANT, "booked", 1)];
  for (let i = 0; i < 25; i++) s.events.push(nested(`e${i}`, T0 + i, APPLICANT, `msg ${i}`));
  const r = await syncApplicantInbox(s, { pageSize: 10, nowMs: T0 + 100 });
  assert.equal(r.created, 25);
  assert.equal(s.cursor?.event_id, "e24");
});

test("first run backfills quietly and old replies never email", async () => {
  const s = new MemStore(); // no cursor
  s.apps = [app("app1", APPLICANT, "booked", 1)];
  s.events = [nested("e1", T0, APPLICANT, "old")];
  let mails = 0;
  const notify = async () => {
    mails++;
  };
  const r = await syncApplicantInbox(s, { notify, nowMs: T0 + 1000 });
  assert.equal(r.backfill, true);
  assert.equal(r.created, 1);
  assert.equal(mails, 0);
  // A late-seen reply from two days ago is stored without an email.
  s.events.push(nested("e2", T0 + 5, APPLICANT, "stale"));
  s.cursor = { received_ms: T0, event_id: "e1" };
  await syncApplicantInbox(s, { notify, nowMs: T0 + 2 * 86_400_000 });
  assert.equal(s.messages.size, 2);
  assert.equal(mails, 0);
});

test("a failed notification email doesn't stop the sync", async () => {
  const s = new MemStore();
  s.cursor = { received_ms: 0, event_id: null };
  s.apps = [app("app1", APPLICANT, "booked", 1)];
  s.events = [nested("e1", T0, APPLICANT, "hi")];
  const r = await syncApplicantInbox(s, {
    nowMs: T0,
    notify: async () => {
      throw new Error("smtp down");
    },
  });
  assert.equal(r.created, 1);
  assert.equal(r.notified, 0);
  assert.equal(r.errors.length, 1);
  assert.equal(s.cursor?.event_id, "e1");
});

// ------------------------------------------------------------ views

test("groupConversations: newest first, unread counts only inbound", () => {
  const convos = groupConversations([
    { id: "1", application_id: "a", direction: "out", text: "join here", attachments: [], at_ms: 1, read: true, kind: "interview_start" },
    { id: "2", application_id: "a", direction: "in", text: "ok", attachments: [], at_ms: 2, read: false, kind: null },
    { id: "3", application_id: "b", direction: "out", text: "hi", attachments: [], at_ms: 5, read: true, kind: "reply" },
  ]);
  assert.deepEqual(convos.map((c) => c.application_id), ["b", "a"]);
  assert.equal(convos[1].unread, 1);
  assert.equal(convos[1].last_text, "ok");
  assert.equal(convos[0].unread, 0);
});

// ------------------------------------------------------------ outbound log

test("sendInterviewText logs the outbound text and keeps its return contract (fetch mocked)", async () => {
  const saved = process.env.HIUBLUE_API_KEY;
  process.env.HIUBLUE_API_KEY = "test-key";
  try {
    const calls: unknown[] = [];
    const logged: OutboundTextRecord[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await sendInterviewText({
      to: "(212) 555-0101",
      text: "hello",
      ref: "app1",
      kind: "reply",
      fetchImpl,
      isOptedOut: async () => false,
      logOutbound: async (rec) => {
        logged.push(rec);
      },
    });
    assert.ok("sent" in r && r.sent);
    assert.equal(calls.length, 1);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].application_id, "app1");
    assert.equal(logged[0].phone, APPLICANT);
    assert.equal(logged[0].kind, "reply");
    assert.equal(logged[0].message_id, "sent" in r ? r.id : null);
    assert.match(String(logged[0].message_id), /^interview_app1_/);

    // A failing log doesn't change the result.
    const r2 = await sendInterviewText({ to: APPLICANT, text: "x", ref: "app1", fetchImpl, isOptedOut: async () => false, logOutbound: async () => { throw new Error("db down"); } });
    assert.ok("sent" in r2 && r2.sent);

    // Not sent: nothing logged.
    const failFetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const r3 = await sendInterviewText({ to: APPLICANT, text: "x", ref: "app1", fetchImpl: failFetch, isOptedOut: async () => false, logOutbound: async (rec) => { logged.push(rec); } });
    assert.ok("error" in r3);
    assert.equal(logged.length, 1);
  } finally {
    if (saved === undefined) delete process.env.HIUBLUE_API_KEY;
    else process.env.HIUBLUE_API_KEY = saved;
  }
});

// ------------------------------------------------------------ check-in (fake Firestore, text mocked)

function fakeDb(doc: Record<string, unknown>) {
  const ref = {
    async set(patch: Record<string, unknown>) {
      Object.assign(doc, patch);
    },
  };
  const db = {
    collection: () => ({ doc: () => ref }),
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>) {
      return fn({
        get: async () => ({ data: () => ({ ...doc }) }),
        set: (_r: unknown, patch: Record<string, unknown>) => Object.assign(doc, patch),
      });
    },
  };
  return db as unknown as Firestore;
}

test("check-in: a reply to the 1h text checks in once and sends the link once", async () => {
  const START = Date.parse("2026-10-08T18:00:00.000Z");
  const iso = "2026-10-08T18:00:00.000Z";
  const doc: Record<string, unknown> = {
    status: "booked",
    email: "a@b.co",
    full_name: "Jamie Rivera",
    calendly_event_start_time: iso,
    calendly_invitee_timezone: "America/Chicago",
    calendly_join_url: "https://zoom.us/j/1",
    interview_reminders_start: iso,
    interview_reminder_1h_text_sent_at: "x",
  };
  const db = fakeDb(doc);
  const sends: Array<{ to: string; text: string; kind?: string }> = [];
  const send = (async (o: { to: string; text: string; kind?: string }) => {
    sends.push(o);
    return { sent: true as const, id: "interview_x" };
  }) as unknown as typeof sendInterviewText;
  const a = app("app1", APPLICANT, "booked", 1);
  const reply = parseIncoming(nested("e1", START - 50 * 60_000, APPLICANT, "Jamie Rivera"))!;

  assert.equal(await handleCheckIn(db, a, reply, START - 50 * 60_000, send), "checked_in");
  assert.equal(doc.interview_checked_in_for, iso);
  assert.equal(doc.interview_checkin_reply, "Jamie Rivera");
  assert.ok(doc.interview_checked_in_at);
  assert.ok(doc.interview_checkin_text_sent_at);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].kind, "checkin_reply");
  assert.equal(sends[0].text, "Thanks Jamie, you're checked in.\n\nHere's the link for 1:00 PM CT:\nhttps://zoom.us/j/1");

  // A second reply doesn't check in again or resend.
  const again = parseIncoming(nested("e2", START - 45 * 60_000, APPLICANT, "hello?"))!;
  assert.equal(await handleCheckIn(db, a, again, START - 45 * 60_000, send), "skipped");
  assert.equal(sends.length, 1);
});

test("check-in: questions, replies outside the window, or without the 1h text are left alone", async () => {
  const START = Date.parse("2026-10-08T18:00:00.000Z");
  const iso = "2026-10-08T18:00:00.000Z";
  const base = { status: "booked", email: "a@b.co", full_name: "Jamie", calendly_event_start_time: iso, interview_reminders_start: iso };
  let sends = 0;
  const send = (async () => {
    sends++;
    return { sent: true as const, id: "x" };
  }) as unknown as typeof sendInterviewText;
  const a = app("app1", APPLICANT, "booked", 1);
  const early = parseIncoming(nested("e1", START - 3 * 3_600_000, APPLICANT, "hi"))!;
  assert.equal(await handleCheckIn(fakeDb({ ...base, interview_reminder_1h_text_sent_at: "x" }), a, early, START - 3 * 3_600_000, send), "skipped");
  const inWindow = parseIncoming(nested("e2", START - 30 * 60_000, APPLICANT, "hi"))!;
  assert.equal(await handleCheckIn(fakeDb({ ...base }), a, inWindow, START - 30 * 60_000, send), "skipped");
  // In the window after the 1h text, but a question: not checked in, no auto-reply.
  const qDoc: Record<string, unknown> = { ...base, interview_reminder_1h_text_sent_at: "x" };
  const question = parseIncoming(nested("e3", START - 30 * 60_000, APPLICANT, "can I reschedule?"))!;
  assert.equal(await handleCheckIn(fakeDb(qDoc), a, question, START - 30 * 60_000, send), "skipped");
  assert.equal(qDoc.interview_checked_in_at, undefined);
  assert.equal(sends, 0);
});

// ------------------------------------------------------------ booking-text confirmation

test("confirm: a name reply to the booking text confirms once and sends the link with day + time", async () => {
  const START = Date.parse("2026-10-08T18:00:00.000Z");
  const iso = "2026-10-08T18:00:00.000Z";
  const sentAt = START - 20 * 3_600_000;
  const doc: Record<string, unknown> = {
    status: "booked",
    email: "a@b.co",
    full_name: "Jamie Rivera",
    calendly_event_start_time: iso,
    calendly_invitee_timezone: "America/Chicago",
    calendly_join_url: "https://zoom.us/j/1",
    interview_booking_text_for: iso,
    interview_booking_text_claimed_at: sentAt,
    interview_booking_text_sent_at: sentAt,
  };
  const db = fakeDb(doc);
  const sends: Array<{ to: string; text: string; kind?: string }> = [];
  const send = (async (o: { to: string; text: string; kind?: string }) => {
    sends.push(o);
    return { sent: true as const, id: "interview_x" };
  }) as unknown as typeof sendInterviewText;
  const a = app("app1", APPLICANT, "booked", 1);
  const at = sentAt + 10 * 60_000;

  // A question is left for a person.
  const q = parseIncoming(nested("c0", at, APPLICANT, "can I reschedule?"))!;
  assert.equal(await handleCheckIn(db, a, q, at, send), "skipped");
  assert.equal(doc.interview_confirmed_at, undefined);

  const reply = parseIncoming(nested("c1", at, APPLICANT, "Jamie Rivera"))!;
  assert.equal(await handleCheckIn(db, a, reply, at, send), "confirmed");
  assert.equal(doc.interview_confirmed_for, iso);
  assert.equal(doc.interview_confirm_reply, "Jamie Rivera");
  assert.ok(doc.interview_confirm_text_sent_at);
  assert.equal(doc.interview_checked_in_at, undefined);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].kind, "confirm_reply");
  assert.equal(sends[0].text, "Thanks Jamie, you're confirmed. Here's the link for Thursday at 1:00 PM CT: https://zoom.us/j/1");

  // Replying again before the 1h text: nothing more.
  const again = parseIncoming(nested("c2", at + 60_000, APPLICANT, "Jamie"))!;
  assert.equal(await handleCheckIn(db, a, again, at + 60_000, send), "skipped");
  assert.equal(sends.length, 1);

  // After the 1h text (which already had the link): checked in, no duplicate link text.
  doc.interview_reminders_start = iso;
  doc.interview_reminder_1h_text_sent_at = "x";
  const after1h = parseIncoming(nested("c3", START - 50 * 60_000, APPLICANT, "Jamie Rivera"))!;
  assert.equal(await handleCheckIn(db, a, after1h, START - 50 * 60_000, send), "checked_in");
  assert.equal(doc.interview_checked_in_for, iso);
  assert.equal(sends.length, 1);
});

test("confirm: no join url points to the Calendly email; no booking text means no confirmation", async () => {
  const START = Date.parse("2026-10-08T18:00:00.000Z");
  const iso = "2026-10-08T18:00:00.000Z";
  const sends: string[] = [];
  const send = (async (o: { text: string }) => {
    sends.push(o.text);
    return { sent: true as const, id: "x" };
  }) as unknown as typeof sendInterviewText;
  const a = app("app1", APPLICANT, "booked", 1);
  const base = { status: "booked", email: "a@b.co", full_name: "Jamie Rivera", calendly_event_start_time: iso };
  const at = START - 5 * 3_600_000;
  const reply = parseIncoming(nested("d1", at, APPLICANT, "Jamie Rivera"))!;

  // Booked before this shipped (no booking text): left for a person, as before.
  assert.equal(await handleCheckIn(fakeDb({ ...base }), a, reply, at, send), "skipped");

  const doc: Record<string, unknown> = { ...base, interview_booking_text_for: iso, interview_booking_text_sent_at: "x" };
  assert.equal(await handleCheckIn(fakeDb(doc), a, reply, at, send), "confirmed");
  assert.deepEqual(sends, ["Thanks Jamie, you're confirmed for Thursday at 2:00 PM ET. The link is in your Calendly email."]);
});

test("check-in after the 1h text also confirms someone who hadn't confirmed", async () => {
  const START = Date.parse("2026-10-08T18:00:00.000Z");
  const iso = "2026-10-08T18:00:00.000Z";
  const doc: Record<string, unknown> = {
    status: "booked",
    email: "a@b.co",
    full_name: "Jamie Rivera",
    calendly_event_start_time: iso,
    calendly_join_url: "https://zoom.us/j/1",
    interview_booking_text_for: iso,
    interview_booking_text_sent_at: "x",
    interview_reminders_start: iso,
    interview_reminder_1h_text_sent_at: "x",
  };
  let sends = 0;
  const send = (async () => {
    sends++;
    return { sent: true as const, id: "x" };
  }) as unknown as typeof sendInterviewText;
  const reply = parseIncoming(nested("f1", START - 40 * 60_000, APPLICANT, "yes"))!;
  assert.equal(await handleCheckIn(fakeDb(doc), app("app1", APPLICANT, "booked", 1), reply, START - 40 * 60_000, send), "checked_in");
  assert.equal(doc.interview_checked_in_for, iso);
  assert.equal(doc.interview_confirmed_for, iso);
  assert.equal(sends, 1);
});

test("sendInterviewText never texts a number that replied STOP (and fails closed)", async () => {
  const saved = process.env.HIUBLUE_API_KEY;
  process.env.HIUBLUE_API_KEY = "test-key";
  try {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const seen: string[] = [];
    const r = await sendInterviewText({
      to: "(212) 555-0101",
      text: "x",
      ref: "app1",
      fetchImpl,
      logOutbound: async () => {},
      isOptedOut: async (p) => {
        seen.push(p);
        return true;
      },
    });
    assert.deepEqual(r, { skipped: "opted out" });
    assert.deepEqual(seen, ["+12125550101"]);
    const r2 = await sendInterviewText({ to: "(212) 555-0101", text: "x", fetchImpl, logOutbound: async () => {}, isOptedOut: async () => { throw new Error("db down"); } });
    assert.ok("error" in r2);
    assert.equal(calls, 0);
  } finally {
    if (saved === undefined) delete process.env.HIUBLUE_API_KEY;
    else process.env.HIUBLUE_API_KEY = saved;
  }
});
