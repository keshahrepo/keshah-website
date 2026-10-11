// Cron (every 15 min, see vercel.json): evening pushes to creators in the
// KESHAH Creators app (rules in lib/creators/nudges.ts):
//   posting    8 PM local on a day they're scheduled to post, first posting
//              day included: "{n} of {need} videos so far today. Deadline 11:59 PM."
//              Their posts are synced first (unless synced in the last 30 min),
//              so the count isn't hours old. Skipped on approved days off and
//              on days they aren't scheduled (trial done and waiting, ended, ...).
//   first day  8 PM local the evening before their first posting day.
//   warm-up    6 PM local on a warm-up day not ticked yet.
// Once per creator per local day each: ContentCreators/{id}/mobile/push
// (nudge_date / first_day_eve_date / warmup_nudge_date), claimed in a
// transaction before sending, freed again when they have no device.
//
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
// GET ?dry=1 reports who would get what without syncing, sending or writing.

import { NextResponse } from "next/server";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireCronSecret } from "@/lib/support/auth";
import { CREATORS_COLLECTION, getOnboarding, listCreators, toPostingDay } from "@/lib/creators/db";
import { completeVideoCount, isScheduledDay, videosRequiredOn } from "@/lib/creators/pay";
import type { CreatorProfile, PostingDay } from "@/lib/creators/types";
import { claimOnce } from "@/lib/interview";
import { NUDGE_HOUR, nudgeNeeded } from "@/lib/mobile/nudge";
import { dailyNudge, notify, type PushMessage } from "@/lib/push";
import { firstPostingDay } from "@/lib/creators/lifecycle";
import { firstDayEvePush, warmupReminderPush } from "@/lib/creators/notices";
import { WARMUP_DAYS } from "@/lib/creators/onboarding-content";
import { syncCreatorPosts } from "@/lib/creators/post-sync";
import { FIRST_DAY_EVE_HOUR, WARMUP_NUDGE_HOUR, firstDayEveDate, localHour, postingNudgeDate, syncIsFresh, warmupNudgeDate } from "@/lib/creators/nudges";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Row = Record<string, unknown>;

/** Claim the marker for `date`, send, free it again when nothing could be delivered. */
async function sendOnce(markerRef: DocumentReference, field: string, date: string, target: { creatorId: string; email: string | null }, msg: PushMessage, row: Row, now: Date) {
  const { db } = getFirebaseAdmin();
  const won = await claimOnce(db, markerRef, (cur) => (cur[field] === date ? null : { [field]: date, [`${field}_at`]: now.toISOString() }));
  if (!won) {
    row.result = "already sent";
    return;
  }
  const r = await notify(target, msg);
  if (!r || r.sent === 0) {
    await markerRef.update({ [field]: FieldValue.delete() }).catch(() => {});
    row.result = r ? "no devices" : "failed";
  } else {
    row.result = "sent";
  }
}

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const now = new Date();
  const report: Row[] = [];
  try {
    const { db } = getFirebaseAdmin();
    const creators = await listCreators();
    for (const c of creators) {
      let hour: number;
      try {
        hour = localHour(now, c.timezone);
      } catch {
        continue;
      }
      if (hour !== NUDGE_HOUR && hour !== WARMUP_NUDGE_HOUR && hour !== FIRST_DAY_EVE_HOUR) continue;
      const ref = db.collection(CREATORS_COLLECTION).doc(c.id);
      const markerRef = ref.collection("mobile").doc("push");
      const target = { creatorId: c.id, email: c.email || null };
      const [marker, onb] = await Promise.all([markerRef.get(), c.start_date ? null : getOnboarding(c.id)]);
      const mark = (k: string) => (marker.exists ? (marker.get(k) as string | undefined) : undefined) ?? null;
      const firstDay = onb ? firstPostingDay(onb.completed_at ?? onb.ready_at ?? null, c.timezone) : null;

      // ---- warm-up reminder (6 PM)
      if (onb) {
        const date = warmupNudgeDate(c, now, onb, mark("warmup_nudge_date"));
        if (date) {
          const row: Row = { id: c.id, name: c.name, kind: "warmup", date };
          report.push(row);
          if (!dry) await sendOnce(markerRef, "warmup_nudge_date", date, target, warmupReminderPush((onb.warmup_days ?? []).length + 1, WARMUP_DAYS), row, now);
        }
      }

      // ---- "Tomorrow is your first posting day" (8 PM the evening before)
      const eve = firstDayEveDate(c, now, firstDay, mark("first_day_eve_date"));
      if (eve && firstDay) {
        const row: Row = { id: c.id, name: c.name, kind: "first_day_eve", date: eve, first_day: firstDay };
        report.push(row);
        const need = videosRequiredOn(c.trial_plan === "v2" ? { start_date: firstDay, trial_plan: "v2" } : undefined, [], firstDay);
        if (!dry) await sendOnce(markerRef, "first_day_eve_date", eve, target, firstDayEvePush(firstDay, need), row, now);
      }

      // ---- posting nudge (8 PM)
      await postingNudge(c, now, { ref, markerRef, target, firstDay, lastNudge: mark("nudge_date"), dry, report });
    }
    return NextResponse.json({ ok: true, dry, checked: creators.length, report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, report }, { status: 500 });
  }
}

async function postingNudge(
  c: CreatorProfile,
  now: Date,
  x: { ref: DocumentReference; markerRef: DocumentReference; target: { creatorId: string; email: string | null }; firstDay: string | null; lastNudge: string | null; dry: boolean; report: Row[] },
) {
  // Trial done, waiting on the founder's decision: nothing to post.
  if (c.trial_plan === "v2" && c.status === "trial" && c.trial_completed_on && !c.trial_outcome) return;
  let days: PostingDay[] | null = null;
  const loadDays = async () => (days ??= (await x.ref.collection("posting_days").get()).docs.map((d) => toPostingDay(d.id, d.data())));
  // isScheduledDay needs the history; load it only when the hour and day already match.
  const pre = postingNudgeDate(c, now, { firstDay: x.firstDay, lastNudgeDate: x.lastNudge, scheduled: () => true });
  if (!pre) return;
  const hist = await loadDays();
  const date = postingNudgeDate(c, now, { firstDay: x.firstDay, lastNudgeDate: x.lastNudge, scheduled: (d) => isScheduledDay(c, hist, d) });
  if (!date) return;
  const off = await x.ref.collection("days_off").doc(date).get();
  const dayOff = off.exists && off.get("status") === "approved";
  const row: Row = { id: c.id, name: c.name, kind: "posting", date, day_off: dayOff };
  x.report.push(row);
  if (dayOff) {
    row.result = "not needed";
    return;
  }
  // Count from fresh posts: the 6-hourly sync can be hours behind at 8 PM.
  const lastOk = (await x.ref.get()).get("post_sync.last_ok_at");
  const fresh = syncIsFresh(typeof lastOk === "string" ? lastOk : null, now);
  if (!fresh && !x.dry && (c.tiktok_handle || c.instagram_handle)) {
    try {
      await syncCreatorPosts(c, { mode: "shallow" });
      row.synced = true;
    } catch (e) {
      row.sync_error = e instanceof Error ? e.message : String(e);
    }
  }
  const day = await x.ref.collection("posting_days").doc(date).get();
  const done = day.exists ? completeVideoCount(day.data() as PostingDay) : 0;
  const profile = c.start_date ? c : c.trial_plan === "v2" ? { start_date: date, trial_plan: "v2" as const } : undefined;
  const need = videosRequiredOn(profile, hist, date);
  row.done = done;
  row.need = need;
  if (!nudgeNeeded(done, false, need)) {
    row.result = "not needed";
    return;
  }
  if (x.dry) return;
  await sendOnce(x.markerRef, "nudge_date", date, x.target, dailyNudge(done, need), row, now);
}
