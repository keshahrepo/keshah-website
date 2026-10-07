/**
 * Push notifications for the KESHAH Creators app via Firebase Cloud Messaging.
 *
 * Device tokens live in push_tokens/{token}
 *   { email, role, creator_id?, application_id?, platform, updated_at }
 * (POST /api/mobile/push/register). sendPush() finds every token for a person
 * (by email, creator id and/or application id, unioned), multicasts, and
 * deletes tokens FCM says are gone. No tokens = no-op.
 *
 * Callers in existing flows use notify(), which never throws, so a push
 * problem can never break a cron, a contract send or a status change.
 *
 * Store and messaging are injectable (tests use an in-memory store and a mock
 * messaging client, see lib/creators/mobile.test.ts).
 */
import type { Firestore, QuerySnapshot } from "firebase-admin/firestore";

export const PUSH_TOKENS = "push_tokens";

export interface PushTarget {
  email?: string | null;
  creatorId?: string | null;
  applicationId?: string | null;
}

export interface PushMessage {
  title: string;
  body: string;
  /** String values only (FCM rule). `type` tells the app which screen to open. */
  data?: Record<string, string>;
}

export interface PushTokenRecord {
  email: string;
  role: string;
  creator_id?: string | null;
  application_id?: string | null;
  platform: "ios" | "android";
  updated_at: string;
}

export interface PushStore {
  upsert(token: string, rec: PushTokenRecord): Promise<void>;
  tokensFor(target: PushTarget): Promise<string[]>;
  remove(tokens: string[]): Promise<void>;
}

/** The slice of firebase-admin's Messaging we use. */
export interface PushMessenger {
  sendEachForMulticast(message: {
    tokens: string[];
    notification: { title: string; body: string };
    data?: Record<string, string>;
    apns?: { payload: { aps: { sound: string } } };
    android?: { priority: "high" | "normal" };
  }): Promise<{ successCount: number; failureCount: number; responses: { success: boolean; error?: { code?: string } }[] }>;
}

export interface PushDeps {
  store?: PushStore;
  messenger?: PushMessenger;
}

/** FCM tokens are long strings of [A-Za-z0-9_:-]; they double as doc ids, so no slashes. */
export function validPushToken(t: unknown): t is string {
  return typeof t === "string" && t.length >= 20 && t.length <= 1024 && /^[A-Za-z0-9_:\-.]+$/.test(t);
}

const GONE = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export function firestorePushStore(db: Firestore): PushStore {
  const col = db.collection(PUSH_TOKENS);
  return {
    async upsert(token, rec) {
      await col.doc(token).set(rec);
    },
    async tokensFor(target) {
      const queries: Promise<QuerySnapshot>[] = [];
      if (target.email) queries.push(col.where("email", "==", target.email.trim().toLowerCase()).get());
      if (target.creatorId) queries.push(col.where("creator_id", "==", target.creatorId).get());
      if (target.applicationId) queries.push(col.where("application_id", "==", target.applicationId).get());
      const snaps = await Promise.all(queries);
      return [...new Set(snaps.flatMap((s) => s.docs.map((d) => d.id)))];
    },
    async remove(tokens) {
      await Promise.all(tokens.map((t) => col.doc(t).delete()));
    },
  };
}

async function defaults(deps: PushDeps): Promise<{ store: PushStore; messenger: PushMessenger }> {
  if (deps.store && deps.messenger) return { store: deps.store, messenger: deps.messenger };
  const { getFirebaseAdmin } = await import("./firebase-admin");
  const { app, db } = getFirebaseAdmin();
  const store = deps.store ?? firestorePushStore(db);
  let messenger = deps.messenger;
  if (!messenger) {
    const { getMessaging } = await import("firebase-admin/messaging");
    messenger = getMessaging(app) as unknown as PushMessenger;
  }
  return { store, messenger };
}

export async function registerPushToken(
  token: string,
  rec: Omit<PushTokenRecord, "updated_at">,
  deps: PushDeps & { now?: Date } = {},
): Promise<void> {
  const store = deps.store ?? (await defaults(deps)).store;
  await store.upsert(token, {
    email: rec.email.trim().toLowerCase(),
    role: rec.role,
    creator_id: rec.creator_id ?? null,
    application_id: rec.application_id ?? null,
    platform: rec.platform,
    updated_at: (deps.now ?? new Date()).toISOString(),
  });
}

export interface PushResult {
  tokens: number;
  sent: number;
  failed: number;
  removed: number;
}

/** Send to every device of one person. Throws only on store / messaging failures (use notify() in flows). */
export async function sendPush(target: PushTarget, msg: PushMessage, deps: PushDeps = {}): Promise<PushResult> {
  if (!target.email && !target.creatorId && !target.applicationId) return { tokens: 0, sent: 0, failed: 0, removed: 0 };
  const { store, messenger } = await defaults(deps);
  const tokens = await store.tokensFor(target);
  if (!tokens.length) return { tokens: 0, sent: 0, failed: 0, removed: 0 };
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  // FCM multicast takes up to 500 tokens per call.
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const r = await messenger.sendEachForMulticast({
      tokens: chunk,
      notification: { title: msg.title, body: msg.body },
      ...(msg.data ? { data: msg.data } : {}),
      apns: { payload: { aps: { sound: "default" } } },
      android: { priority: "high" },
    });
    sent += r.successCount;
    failed += r.failureCount;
    r.responses.forEach((res, j) => {
      if (!res.success && res.error?.code && GONE.has(res.error.code)) gone.push(chunk[j]);
    });
  }
  if (gone.length) await store.remove(gone);
  return { tokens: tokens.length, sent, failed, removed: gone.length };
}

/** Fire-and-forget wrapper for existing flows: logs and swallows every error. */
export async function notify(target: PushTarget, msg: PushMessage, deps: PushDeps = {}): Promise<PushResult | null> {
  try {
    return await sendPush(target, msg, deps);
  } catch (e) {
    console.error("push failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ---------------------------------------------------------------- copy

export const PUSH_COPY = {
  interview1h: { title: "Group interview", body: "Your group interview starts in 1 hour. Tap to check in.", data: { type: "interview_1h" } },
  interviewNow: { title: "Group interview", body: "We're waiting for you. Tap to join.", data: { type: "interview_start" } },
  accepted: { title: "KESHAH Creators", body: "You're in. Open KESHAH Creators to get started.", data: { type: "accepted" } },
  contractSent: { title: "Your contract", body: "Your contract is ready to sign", data: { type: "contract" } },
  bonus100k: { title: "Bonus added", body: "A video passed 100K views. Bonus added.", data: { type: "bonus" } },
  bonus1m: { title: "Bonus added", body: "A video passed 1M views. Bonus added.", data: { type: "bonus" } },
} satisfies Record<string, PushMessage>;

export function dailyNudge(done: number): PushMessage {
  return { title: "Today's videos", body: `${done} of 5 videos so far today. Deadline 11:59 PM.`, data: { type: "daily_nudge" } };
}
