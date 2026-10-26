/**
 * Tracking links made ahead of time, so a new creator's bio step never waits
 * on the founder. The founder makes a batch of AppStack links once and lists
 * them in Settings/creator_link_pool:
 *
 *   links: [{ url: "https://appstack.link/…", campaign: "creator_07" }, …]
 *
 * Accepting a creator hands them the first free one: tracking_url, plus the
 * link's campaign in campaign_tags so installs are credited to them.
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { notifyFounder } from "@/lib/staff";
import { CREATORS_COLLECTION } from "./db";

export const LINK_POOL_DOC = "Settings/creator_link_pool";

export interface PooledLink {
  url: string;
  campaign: string;
  assigned_to?: string;
  assigned_at?: string;
}

function clean(v: unknown): PooledLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      url: String(x.url ?? "").trim(),
      campaign: String(x.campaign ?? "").trim(),
      ...(typeof x.assigned_to === "string" && x.assigned_to ? { assigned_to: x.assigned_to } : {}),
      ...(typeof x.assigned_at === "string" && x.assigned_at ? { assigned_at: x.assigned_at } : {}),
    }))
    .filter((x) => /^https:\/\//.test(x.url) && x.campaign);
}

/** Index of the link to give `creatorId`: one already theirs, else the first free one; -1 when none is free. */
export function pickLink(links: PooledLink[], creatorId: string): number {
  const mine = links.findIndex((l) => l.assigned_to === creatorId);
  return mine >= 0 ? mine : links.findIndex((l) => !l.assigned_to);
}

/** Free links left, for the founder's warning. */
export function freeCount(links: PooledLink[]): number {
  return links.filter((l) => !l.assigned_to).length;
}

export type AssignResult = { status: "assigned" | "had_link"; url: string } | { status: "empty" };

/**
 * Give the creator a pooled link if they don't have one yet. Idempotent: a
 * creator who already has a tracking_url keeps it.
 */
export async function assignPooledLink(creatorId: string, now: Date = new Date(), store?: Firestore): Promise<AssignResult> {
  const db = store ?? getFirebaseAdmin().db;
  const poolRef = db.doc(LINK_POOL_DOC);
  const creatorRef = db.collection(CREATORS_COLLECTION).doc(creatorId);
  const res = await db.runTransaction(async (tx) => {
    const [pool, creator] = await Promise.all([tx.get(poolRef), tx.get(creatorRef)]);
    const existing = String(creator.data()?.tracking_url ?? "").trim();
    if (existing) return { result: { status: "had_link", url: existing } as AssignResult, left: -1 };
    const links = clean(pool.data()?.links);
    const i = pickLink(links, creatorId);
    if (i < 0) return { result: { status: "empty" } as AssignResult, left: 0 };
    const iso = now.toISOString();
    links[i] = { ...links[i], assigned_to: creatorId, assigned_at: iso };
    tx.set(poolRef, { links, updated_at: iso }, { merge: true });
    tx.update(creatorRef, {
      tracking_url: links[i].url,
      tracking_url_set_at: iso,
      campaign_tags: FieldValue.arrayUnion(links[i].campaign),
    });
    return { result: { status: "assigned", url: links[i].url } as AssignResult, left: freeCount(links) };
  });
  if (res.result.status === "empty") {
    await notifyFounder({ title: "No tracking links left", body: "Add AppStack links to the creator link pool, then add one for your new creator.", data: { type: "founder_creator", id: creatorId } }).catch(() => {});
  } else if (res.result.status === "assigned" && res.left <= 2) {
    await notifyFounder({ title: `${res.left} tracking link${res.left === 1 ? "" : "s"} left`, body: "Make a few more AppStack links for the creator link pool.", data: { type: "founder_creator", id: creatorId } }).catch(() => {});
  }
  return res.result;
}
