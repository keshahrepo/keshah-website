// The pinned video: every new creator's first posting day is one video, the
// one pinned on both profiles. They make it from the script in the app, upload
// it for review (that counts the day), the founder approves it or sends it
// back with a note, then they post and pin it. The post sync shows when it's
// pinned (a pinned post on their profile).
import { randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { notify } from "@/lib/push";
import { notifyFounder } from "@/lib/staff";
import { signedReadUrl, signedUploadUrl } from "./admin";
import { CREATORS_COLLECTION, CreatorDataError, creatorToday, getCreator, getOnboarding, hasStarted, setStartDateIfUnset } from "./db";
import { isWeekday } from "./pay";

/** requested: the founder asked an existing creator for one (no upload yet). */
export type PinnedStatus = "requested" | "submitted" | "changes" | "approved";

export interface PinnedVideo {
  status: PinnedStatus;
  /** Storage path of the latest upload (random name: storage serves known paths). Empty while requested. */
  path: string;
  submitted_at: string;
  /** Requested: the creator-local day that's their pinned video day (only that video that day). */
  requested_day?: string;
  /** The creator-local day the first upload counted for (their first posting day). */
  counted_day?: string;
  note?: string;
  reviewed_at?: string;
  approved_at?: string;
  /** The founder checked it by hand ("Mark as pinned"). */
  marked_pinned_at?: string;
}

/** Where the approved video is pinned: a pinned post on each app, posted after approval. */
export interface PinnedLive {
  tiktok: boolean;
  instagram: boolean;
  done: boolean;
}

const UPLOAD_PREFIX = (id: string) => `creators/${id}/pinned/`;
const OK_TYPES = new Set(["video/mp4", "video/quicktime"]);

function db(store?: Firestore) {
  return store ?? getFirebaseAdmin().db;
}

export function pinnedOf(d: Record<string, unknown> | undefined): PinnedVideo | null {
  const p = d?.pinned_video as Partial<PinnedVideo> | undefined;
  if (!p || typeof p.status !== "string") return null;
  if (p.status !== "requested" && !p.path) return null;
  return { path: "", submitted_at: "", ...p } as PinnedVideo;
}

/** The day itself if it's a weekday, else the next weekday. */
function weekdayFrom(d: string): string {
  let cur = d;
  while (!isWeekday(cur)) {
    const t = new Date(`${cur}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    cur = t.toISOString().slice(0, 10);
  }
  return cur;
}

/**
 * Founder asks an existing creator for a pinned video: `when` today or their
 * next weekday becomes a pinned video day (only that video, counted on upload).
 */
export async function requestPinned(id: string, when: "today" | "next", now: Date = new Date()): Promise<PinnedVideo> {
  const creator = await getCreator(id);
  if (!creator) throw new CreatorDataError("Creator not found", 404);
  const ref = db().collection(CREATORS_COLLECTION).doc(id);
  const cur = pinnedOf((await ref.get()).data());
  if (cur && cur.status !== "approved") throw new CreatorDataError("They already have a pinned video on the go.", 409);
  const today = creatorToday(creator, now);
  const t = new Date(`${today}T12:00:00Z`);
  if (when === "next") t.setUTCDate(t.getUTCDate() + 1);
  const day = weekdayFrom(t.toISOString().slice(0, 10));
  const next: PinnedVideo = { status: "requested", path: "", submitted_at: "", requested_day: day };
  await ref.update({ pinned_video: { status: "requested", requested_day: day, requested_at: now.toISOString() } });
  await notify(
    { creatorId: id, email: creator.email || null },
    { title: "Your pinned video", body: day === today ? "Today your only video is your pinned video. Open the app to start." : "Your pinned video day is coming up. That day, it's your only video.", data: { type: "pinned_requested" } },
  );
  return next;
}

/**
 * Is the approved video pinned? The post sync records each post's pinned flag
 * (TikTok marks it; Instagram lists pinned Reels). A pinned post posted after
 * approval is the new one, on each app separately. "Mark as pinned" counts as both.
 */
export async function pinnedLiveFor(id: string, p: PinnedVideo | null, store?: Firestore): Promise<PinnedLive> {
  if (!p || p.status !== "approved") return { tiktok: false, instagram: false, done: false };
  if (p.marked_pinned_at) return { tiktok: true, instagram: true, done: true };
  const since = p.approved_at ?? "";
  const s = await db(store).collection(CREATORS_COLLECTION).doc(id).collection("posts").where("pinned", "==", true).get();
  const newer = s.docs.map((d) => d.data()).filter((x) => typeof x.posted_at === "string" && x.posted_at >= since);
  const tiktok = newer.some((x) => x.platform === "tiktok");
  const instagram = newer.some((x) => x.platform === "instagram");
  return { tiktok, instagram, done: tiktok && instagram };
}

/** Founder: checked their profiles by hand. */
export async function markPinned(id: string, now: Date = new Date()): Promise<void> {
  const ref = db().collection(CREATORS_COLLECTION).doc(id);
  const cur = pinnedOf((await ref.get()).data());
  if (!cur || cur.status !== "approved") throw new CreatorDataError("Approve their pinned video first.", 409);
  await ref.update({ "pinned_video.marked_pinned_at": now.toISOString() });
}

/** A one-time upload URL under the creator's own random path. */
export async function pinnedUploadUrl(id: string, contentType: string): Promise<{ upload_url: string; path: string }> {
  if (!OK_TYPES.has(contentType)) throw new CreatorDataError("Pick a video from your camera roll.");
  const ext = contentType === "video/quicktime" ? "mov" : "mp4";
  const path = `${UPLOAD_PREFIX(id)}${randomBytes(16).toString("hex")}.${ext}`;
  return { upload_url: await signedUploadUrl(path, contentType), path };
}

/**
 * They uploaded it: save it for review. The first upload counts their first
 * posting day (a weekday, setup done, pay not started yet) and starts their pay.
 */
export async function submitPinned(id: string, path: string, now: Date = new Date()): Promise<PinnedVideo> {
  if (!path.startsWith(UPLOAD_PREFIX(id)) || path.includes("..")) throw new CreatorDataError("That upload isn't yours.", 403);
  const creator = await getCreator(id);
  if (!creator) throw new CreatorDataError("Creator not found", 404);
  const ref = db().collection(CREATORS_COLLECTION).doc(id);
  const prev = pinnedOf((await ref.get()).data());
  if (prev?.status === "approved") throw new CreatorDataError("Your pinned video is already approved. Post it and pin it.", 409);
  const requested = prev?.status === "requested";
  const iso = now.toISOString();
  const today = creatorToday(creator, now);
  const onb = await getOnboarding(id);
  // New creators: their first posting day. Asked for by the founder: whichever weekday they send it.
  const counts = !prev?.counted_day && isWeekday(today) && (requested || (!hasStarted(creator) && !!onb.completed_at));
  const next: PinnedVideo = {
    status: "submitted",
    path,
    submitted_at: iso,
    ...(prev?.counted_day ? { counted_day: prev.counted_day } : counts ? { counted_day: today } : {}),
  };
  await ref.update({ pinned_video: next });
  if (counts) {
    await ref.collection("posting_days").doc(today).set({ date: today, counted_by_founder: "Pinned video sent for review", logged_at: iso }, { merge: true });
    if (!requested && (await setStartDateIfUnset(id, today))) {
      await notifyFounder({ title: `${creator.name || "A creator"} started posting`, body: "Their pinned video is in for review.", data: { type: "founder_creator", id } }).catch(() => {});
    }
  }
  await notifyFounder({
    title: prev && !requested ? `${creator.name || "A creator"} sent their pinned video again` : `${creator.name || "A creator"} sent their pinned video`,
    body: "Tap to review it.",
    data: { type: "founder_pinned", id },
  }).catch(() => {});
  return next;
}

/** Founder: approve it, or send it back with a note. */
export async function reviewPinned(id: string, action: "approve" | "changes", note: string, now: Date = new Date()): Promise<PinnedVideo> {
  const ref = db().collection(CREATORS_COLLECTION).doc(id);
  const snap = await ref.get();
  const cur = pinnedOf(snap.data());
  if (!cur || cur.status === "requested") throw new CreatorDataError("There's no pinned video to review yet.", 404);
  const iso = now.toISOString();
  const clean = note.trim().slice(0, 1000);
  if (action === "changes" && !clean) throw new CreatorDataError("Add a note so they know what to change.");
  const next: PinnedVideo =
    action === "approve"
      ? { ...cur, status: "approved", reviewed_at: iso, approved_at: iso, ...(clean ? { note: clean } : {}) }
      : { ...cur, status: "changes", reviewed_at: iso, note: clean };
  if (action === "approve" && !clean) delete next.note;
  await ref.update({ pinned_video: next });
  const email = String(snap.data()?.email ?? "").trim() || null;
  await notify(
    { creatorId: id, email },
    action === "approve"
      ? { title: "Your pinned video is approved", body: "Post it on TikTok and Instagram, then pin it.", data: { type: "pinned_approved" } }
      : { title: "A change for your pinned video", body: clean.slice(0, 120), data: { type: "pinned_changes" } },
  );
  return next;
}

/** For the founder's review screen: the video to watch (signed for an hour). */
export async function pinnedForReview(id: string): Promise<(PinnedVideo & { video_url: string }) | null> {
  const cur = pinnedOf((await db().collection(CREATORS_COLLECTION).doc(id).get()).data());
  if (!cur) return null;
  return { ...cur, video_url: cur.path ? await signedReadUrl(cur.path, 60) : "" };
}
