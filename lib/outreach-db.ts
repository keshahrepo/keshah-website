/**
 * Outreach pipeline, Firestore + Gmail side (pure rules: lib/outreach.ts).
 *   addOutreachCreator  every creator we email becomes an "emailed" application
 *   syncOutreachReplies reads contact@keshah.com and moves anyone who replied to "replied"
 *   sendOutreachNudges  the 48-hour follow-ups, as replies in our thread (lib/outreach-nudges.ts)
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { OUTREACH_SOURCE, addressOf, firstOutreachEmail, replySnippet } from "./outreach";
import { NUDGE_DAILY_CAP, NUDGE_RUN_LIMIT, calendarNudge, easternNow, greeting, inSendWindow, noReplyNudge, nudgeDue, replySubject, type NudgeKind } from "./outreach-nudges";
import { sendEmail } from "@/lib/email";

const APPLICATIONS = "careers_applications";

export interface OutreachCreator {
  email: string;
  full_name: string;
  social_handle?: string;
  followers?: number;
  /** The line about their video in our email ("I came across your video…"). */
  video_line?: string;
  emailed_at?: string;
  /** "Hey Abbie," as written in the first email (the follow-ups reuse it). */
  greet?: string;
}

/** Adds a creator we just emailed. Never touches someone already in the list (any status). */
export async function addOutreachCreator(c: OutreachCreator, store?: Firestore): Promise<{ id: string; created: boolean }> {
  const db = store ?? getFirebaseAdmin().db;
  const email = c.email.trim().toLowerCase();
  const existing = await db.collection(APPLICATIONS).where("email", "==", email).limit(1).get();
  if (!existing.empty) return { id: existing.docs[0].id, created: false };
  const now = FieldValue.serverTimestamp();
  const ref = await db.collection(APPLICATIONS).add({
    listing_slug: "paid-creator-intern",
    full_name: c.full_name.trim(),
    email,
    source: OUTREACH_SOURCE,
    status: "emailed",
    ...(c.social_handle ? { social_handle: c.social_handle } : {}),
    ...(typeof c.followers === "number" ? { followers: c.followers } : {}),
    ...(c.video_line ? { outreach_video_line: c.video_line } : {}),
    ...(c.greet ? { outreach_greet: c.greet } : {}),
    emailed_at: c.emailed_at ?? new Date().toISOString(),
    consent: false,
    submitted_at: now,
    last_updated_at: now,
  });
  return { id: ref.id, created: true };
}

/**
 * Reads contact@keshah.com (the last `days` days):
 *   Inbox: a reply from someone at "emailed" moves them to "replied".
 *   Sent:  the founder's reply with a calendly.com link to someone at "emailed"
 *          or "replied" moves them to "invited" (calendar sent, not booked yet).
 * So the founder just replies in Gmail as usual.
 */
export async function syncOutreachReplies(opts: { days?: number; dry?: boolean; store?: Firestore } = {}): Promise<{ checked: number; replied: { email: string; name: string }[]; invited: { email: string; name: string }[] }> {
  const db = opts.store ?? getFirebaseAdmin().db;
  const user = process.env.KESHAH_GMAIL_USER;
  const pass = process.env.KESHAH_GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Email not configured (KESHAH_GMAIL_USER / KESHAH_GMAIL_APP_PASSWORD).");

  // Single-field queries (no composite index needed).
  const [emailedSnap, repliedSnap] = await Promise.all([
    db.collection(APPLICATIONS).where("status", "==", "emailed").get(),
    db.collection(APPLICATIONS).where("status", "==", "replied").get(),
  ]);
  const emailed = new Map(emailedSnap.docs.map((d) => [String(d.get("email") ?? "").toLowerCase(), d]));
  const open = new Map([...emailed, ...repliedSnap.docs.map((d) => [String(d.get("email") ?? "").toLowerCase(), d] as const)]);
  const replied: { email: string; name: string }[] = [];
  const invited: { email: string; name: string }[] = [];
  if (!open.size) return { checked: 0, replied, invited };

  const since = new Date(Date.now() - (opts.days ?? 3) * 86_400_000);
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();
  let checked = 0;
  try {
    // ---- Inbox: their replies
    if (emailed.size) {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = (await client.search({ since }, { uid: true })) || [];
        for await (const msg of client.fetch(uids, { envelope: true, source: true }, { uid: true })) {
          checked++;
          const from = addressOf(String(msg.envelope?.from?.[0]?.address ?? ""));
          const doc = emailed.get(from);
          if (!doc) continue;
          emailed.delete(from);
          const parsed = await simpleParser(msg.source as Buffer);
          replied.push({ email: from, name: String(doc.get("full_name") ?? from) });
          if (opts.dry) continue;
          await doc.ref.set(
            { status: "replied", replied_at: (parsed.date ?? new Date()).toISOString(), reply_snippet: replySnippet(parsed.text ?? ""), last_updated_at: FieldValue.serverTimestamp() },
            { merge: true },
          );
        }
      } finally {
        lock.release();
      }
    }
    // ---- Sent: the founder's replies with the calendar link
    const lock = await client.getMailboxLock("[Gmail]/Sent Mail");
    try {
      const uids = (await client.search({ since, body: "calendly.com" }, { uid: true })) || [];
      for await (const msg of client.fetch(uids, { envelope: true, source: true }, { uid: true })) {
        checked++;
        const to = (msg.envelope?.to ?? []).map((t) => addressOf(String(t.address ?? "")));
        const who = to.find((t) => open.has(t));
        if (!who) continue;
        const doc = open.get(who)!;
        open.delete(who);
        const parsed = await simpleParser(msg.source as Buffer);
        if (!/calendly\.com/i.test(parsed.text ?? "") && !/calendly\.com/i.test(String(parsed.html ?? ""))) continue;
        invited.push({ email: who, name: String(doc.get("full_name") ?? who) });
        if (opts.dry) continue;
        await doc.ref.set({ status: "invited", calendar_sent_at: (parsed.date ?? new Date()).toISOString(), last_updated_at: FieldValue.serverTimestamp() }, { merge: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return { checked, replied, invited };
}

/**
 * Sends the due follow-ups (lib/outreach-nudges.ts): replies in our Gmail
 * thread, weekday mornings ET, only while Settings/outreach_nudges.enabled.
 * Skips (and records why) anyone who wrote to us, or we wrote to, since.
 */
export async function sendOutreachNudges(opts: { dry?: boolean; now?: Date; deadlineMs?: number; store?: Firestore } = {}): Promise<{ sent: { name: string; kind: NudgeKind }[]; skipped: { name: string; reason: string }[]; off?: string }> {
  const db = opts.store ?? getFirebaseAdmin().db;
  const now = opts.now ?? new Date();
  const sent: { name: string; kind: NudgeKind }[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const settings = await db.collection("Settings").doc("outreach_nudges").get();
  if (settings.get("enabled") !== true) return { sent, skipped, off: "turned off" };
  if (!inSendWindow(now)) return { sent, skipped, off: "outside the weekday morning window" };
  const user = process.env.KESHAH_GMAIL_USER;
  const pass = process.env.KESHAH_GMAIL_APP_PASSWORD;
  if (!user || !pass) return { sent, skipped, off: "email not configured" };

  const [emailedSnap, invitedSnap] = await Promise.all([
    db.collection(APPLICATIONS).where("status", "==", "emailed").get(),
    db.collection(APPLICATIONS).where("status", "==", "invited").get(),
  ]);
  const all = [...emailedSnap.docs, ...invitedSnap.docs].filter((d) => d.get("source") === OUTREACH_SOURCE);
  // Daily cap: nudges already sent today (US Eastern).
  const today = easternNow(now).date;
  const sentToday = all.filter((d) => [d.get("nudge_noreply_sent_at"), d.get("nudge_calendar_sent_at")].some((v) => typeof v === "string" && easternNow(new Date(v)).date === today)).length;
  const room = Math.min(NUDGE_RUN_LIMIT, NUDGE_DAILY_CAP - sentToday);
  const due = all.map((d) => ({ d, kind: nudgeDue(d.data(), now.getTime()) })).filter((x): x is { d: typeof x.d; kind: NudgeKind } => !!x.kind);
  if (room <= 0 || !due.length) return { sent, skipped };

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();
  try {
    for (const { d, kind } of due) {
      if (sent.length >= room) break;
      if (opts.deadlineMs && Date.now() > opts.deadlineMs) break;
      const x = d.data();
      const email = String(x.email ?? "").toLowerCase();
      const name = String(x.full_name || email);
      const since = new Date(Date.parse(String(x.emailed_at ?? "")) - 86_400_000);
      const after = Date.parse(String(kind === "noreply" ? x.emailed_at : x.calendar_sent_at));
      // Our messages to them (oldest first), and anything they sent us.
      const ours: { id: string; subject: string; date: number }[] = [];
      let lock = await client.getMailboxLock("[Gmail]/Sent Mail");
      try {
        const uids = (await client.search({ to: email, since }, { uid: true })) || [];
        for await (const m of client.fetch(uids, { envelope: true }, { uid: true })) {
          if (m.envelope?.messageId) ours.push({ id: m.envelope.messageId, subject: String(m.envelope.subject ?? ""), date: m.envelope.date ? new Date(m.envelope.date).getTime() : 0 });
        }
      } finally {
        lock.release();
      }
      let theirs = 0;
      lock = await client.getMailboxLock("INBOX");
      try {
        const uids = (await client.search({ from: email, since: new Date(after) }, { uid: true })) || [];
        theirs = uids.length;
      } finally {
        lock.release();
      }
      ours.sort((a, b) => a.date - b.date);
      const last = ours[ours.length - 1];
      // A minute of slack: the message that set the stage is ours too.
      const reason = !last ? "couldn't find our email in Sent" : theirs ? "they wrote to us since" : last.date > after + 60_000 ? "you wrote to them since" : null;
      if (reason) {
        skipped.push({ name, reason });
        if (!opts.dry) await d.ref.set({ nudge_skipped: { [kind]: reason } }, { merge: true });
        continue;
      }
      const text = kind === "noreply" ? noReplyNudge(greeting(x), typeof x.nudge_video === "string" ? x.nudge_video : null) : calendarNudge(greeting(x));
      if (!opts.dry) {
        await sendEmail({ to: email, subject: replySubject(last!.subject), text, inReplyTo: last!.id, references: ours.map((o) => o.id) });
        await d.ref.set({ [kind === "noreply" ? "nudge_noreply_sent_at" : "nudge_calendar_sent_at"]: new Date().toISOString(), last_updated_at: FieldValue.serverTimestamp() }, { merge: true });
        // A few seconds between sends, so they don't go out as one burst.
        await new Promise((r) => setTimeout(r, 2000 + Math.floor(Math.random() * 4000)));
      }
      sent.push({ name, kind });
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return { sent, skipped };
}

// ---------------------------------------------------------------- daily send queue

/**
 * outreach_queue/{id}: creators found by the daily search, waiting for their
 * first email. { email, full_name, greet, line, social_handle, followers,
 * status: "queued" | "sent" | "skipped", queued_at, sent_at?, skip_reason? }.
 * Weekdays from 11 AM ET, a few per cron run, up to the daily cap
 * (Settings/outreach_daily.cap, default 25); each send adds them to the
 * pipeline as "emailed".
 */
export const QUEUE = "outreach_queue";
export const QUEUE_PER_RUN = 4;
export const QUEUE_DEFAULT_CAP = 25;
export const QUEUE_FROM_HOUR = 11;
export const QUEUE_TO_HOUR = 16;

export async function sendQueuedOutreach(opts: { dry?: boolean; now?: Date; deadlineMs?: number; store?: Firestore } = {}): Promise<{ sent: string[]; skipped: string[]; off?: string; cap?: number; sent_today?: number }> {
  const db = opts.store ?? getFirebaseAdmin().db;
  const now = opts.now ?? new Date();
  const sent: string[] = [];
  const skipped: string[] = [];
  const settings = (await db.collection("Settings").doc("outreach_daily").get()).data() ?? {};
  if (settings.paused === true) return { sent, skipped, off: "paused" };
  const { weekday, hour, date } = easternNow(now);
  if (weekday < 1 || weekday > 5 || hour < QUEUE_FROM_HOUR || hour >= QUEUE_TO_HOUR) return { sent, skipped, off: "outside weekdays 11 AM to 4 PM ET" };
  const cap = typeof settings.cap === "number" ? settings.cap : QUEUE_DEFAULT_CAP;
  const sentSnap = await db.collection(QUEUE).where("status", "==", "sent").get();
  const sentToday = sentSnap.docs.filter((d) => typeof d.get("sent_at") === "string" && easternNow(new Date(d.get("sent_at"))).date === date).length;
  const room = Math.min(QUEUE_PER_RUN, cap - sentToday);
  if (room <= 0) return { sent, skipped, cap, sent_today: sentToday };
  const queued = (await db.collection(QUEUE).where("status", "==", "queued").get()).docs.sort((a, b) => String(a.get("queued_at")).localeCompare(String(b.get("queued_at"))));
  for (const q of queued) {
    if (sent.length >= room) break;
    if (opts.deadlineMs && Date.now() > opts.deadlineMs) break;
    const x = q.data();
    const email = String(x.email ?? "").trim().toLowerCase();
    // Never a second first email: anyone already in the pipeline is skipped.
    const exists = email ? !(await db.collection(APPLICATIONS).where("email", "==", email).limit(1).get()).empty : true;
    if (exists || !x.line) {
      skipped.push(email || q.id);
      if (!opts.dry) await q.ref.set({ status: "skipped", skip_reason: exists ? "already in the pipeline" : "no line" }, { merge: true });
      continue;
    }
    const mail = firstOutreachEmail(String(x.greet ?? ""), String(x.line));
    if (!opts.dry) {
      await sendEmail({ to: email, subject: mail.subject, text: mail.text });
      const at = new Date().toISOString();
      await addOutreachCreator({ email, full_name: String(x.full_name || x.social_handle || email), social_handle: x.social_handle ? String(x.social_handle) : undefined, followers: typeof x.followers === "number" ? x.followers : undefined, video_line: String(x.line), greet: String(x.greet ?? ""), emailed_at: at }, db);
      await q.ref.set({ status: "sent", sent_at: at }, { merge: true });
      await new Promise((r) => setTimeout(r, 3000 + Math.floor(Math.random() * 5000)));
    }
    sent.push(email);
  }
  return { sent, skipped, cap, sent_today: sentToday + sent.length };
}
