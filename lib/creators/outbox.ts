/**
 * Creator outbox: one-off messages to a creator from McKenzie (contact@, via the
 * server's mail credentials), written to Firestore by an admin script and sent
 * by the creator-nudge cron (every 15 min).
 *
 * CreatorOutbox/{id}: { creator_id, subject, text, push?: {title, body},
 *   status: "pending" | "sending" | "sent" | "failed", created_at, sent_at?, error? }
 * Claimed pending -> sending in a transaction, so a message never goes twice.
 */

import type { Firestore } from "firebase-admin/firestore";

export const OUTBOX_COLLECTION = "CreatorOutbox";

export interface OutboxDeps {
  db: Firestore;
  creatorEmail(id: string): Promise<{ email: string; name: string } | null>;
  sendEmail(to: string, subject: string, text: string): Promise<void>;
  push(creatorId: string, title: string, body: string): Promise<void>;
  now?: () => Date;
}

export interface OutboxResult {
  sent: string[];
  failed: { id: string; error: string }[];
}

/** {first} in subject or text becomes the creator's first name. */
export function fillName(s: string, name: string): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  return s.replace(/\{first\}/g, first);
}

export async function processOutbox(deps: OutboxDeps, limit = 20): Promise<OutboxResult> {
  const now = deps.now ?? (() => new Date());
  const out: OutboxResult = { sent: [], failed: [] };
  const col = deps.db.collection(OUTBOX_COLLECTION);
  const pending = await col.where("status", "==", "pending").limit(limit).get();
  for (const doc of pending.docs) {
    const claimed = await deps.db.runTransaction(async (tx) => {
      const cur = await tx.get(doc.ref);
      if (cur.data()?.status !== "pending") return false;
      tx.update(doc.ref, { status: "sending", claimed_at: now().toISOString() });
      return true;
    });
    if (!claimed) continue;
    const m = doc.data();
    try {
      const who = await deps.creatorEmail(String(m.creator_id ?? ""));
      if (!who?.email) throw new Error("No email for that creator.");
      await deps.sendEmail(who.email, fillName(String(m.subject), who.name), fillName(String(m.text), who.name));
      if (m.push && typeof m.push === "object") {
        await deps.push(String(m.creator_id), fillName(String(m.push.title ?? ""), who.name), fillName(String(m.push.body ?? ""), who.name)).catch(() => {});
      }
      await doc.ref.update({ status: "sent", sent_at: now().toISOString(), sent_to: who.email });
      out.sent.push(doc.id);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await doc.ref.update({ status: "failed", error });
      out.failed.push({ id: doc.id, error });
    }
  }
  return out;
}
