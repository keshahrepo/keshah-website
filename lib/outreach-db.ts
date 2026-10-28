/**
 * Outreach pipeline, Firestore + Gmail side (pure rules: lib/outreach.ts).
 *   addOutreachCreator  every creator we email becomes an "emailed" application
 *   syncOutreachReplies reads contact@keshah.com and moves anyone who replied to "replied"
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { notifyFounder } from "@/lib/staff";
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
 * Replies in contact@keshah.com from creators still at "emailed" move them to
 * "replied" with the first lines of their reply. Looks back `days` days.
 */
export async function syncOutreachReplies(opts: { days?: number; dry?: boolean; store?: Firestore } = {}): Promise<{ checked: number; replied: { email: string; name: string }[] }> {
  const db = opts.store ?? getFirebaseAdmin().db;
  const user = process.env.KESHAH_GMAIL_USER;
  const pass = process.env.KESHAH_GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Email not configured (KESHAH_GMAIL_USER / KESHAH_GMAIL_APP_PASSWORD).");

  // Who we're waiting on: status "emailed" (single-field query, no index needed).
  const waiting = await db.collection(APPLICATIONS).where("status", "==", "emailed").get();
  const byEmail = new Map(waiting.docs.map((d) => [String(d.get("email") ?? "").toLowerCase(), d]));
  const out: { email: string; name: string }[] = [];
  if (!byEmail.size) return { checked: 0, replied: out };

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();
  let checked = 0;
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - (opts.days ?? 3) * 86_400_000);
      const uids = (await client.search({ since }, { uid: true })) || [];
      for await (const msg of client.fetch(uids, { envelope: true, source: true }, { uid: true })) {
        checked++;
        const from = msg.envelope?.from?.[0]?.address ? String(msg.envelope.from[0].address).toLowerCase() : "";
        const doc = byEmail.get(addressOf(from));
        if (!doc) continue;
        byEmail.delete(addressOf(from));
        const parsed = await simpleParser(msg.source as Buffer);
        const snippet = replySnippet(parsed.text ?? "");
        const name = String(doc.get("full_name") ?? from);
        out.push({ email: from, name });
        if (opts.dry) continue;
        await doc.ref.set(
          {
            status: "replied",
            replied_at: (parsed.date ?? new Date()).toISOString(),
            reply_snippet: snippet,
            last_updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        await notifyFounder({ title: `${name.split(" ")[0]} replied`, body: snippet.slice(0, 120) || "Open Recruit to send your calendar.", data: { type: "founder_recruit", id: doc.id } }).catch(() => {});
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return { checked, replied: out };
}
