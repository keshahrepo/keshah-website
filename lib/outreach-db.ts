/**
 * Outreach pipeline, Firestore + Gmail side (pure rules: lib/outreach.ts).
 *   addOutreachCreator  every creator we email becomes an "emailed" application
 *   syncOutreachReplies reads contact@keshah.com and moves anyone who replied to "replied"
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { OUTREACH_SOURCE, addressOf, replySnippet } from "./outreach";

const APPLICATIONS = "careers_applications";

export interface OutreachCreator {
  email: string;
  full_name: string;
  social_handle?: string;
  followers?: number;
  /** The line about their video in our email ("I came across your video…"). */
  video_line?: string;
  emailed_at?: string;
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
