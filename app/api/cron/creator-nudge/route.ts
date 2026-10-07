// Cron (every 15 min, see vercel.json): evening push to creators in the
// KESHAH Creators app. At 8 PM in the creator's timezone on a weekday, if
// fewer than 5 videos count for today (and it isn't an approved day off):
// "{n} of 5 videos so far today. Deadline 11:59 PM."
// Once per creator per local day: ContentCreators/{id}/mobile/push.nudge_date,
// claimed in a transaction before sending (freed again when they have no
// device, so installing the app at 8:40 still gets it).
//
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
// GET ?dry=1 reports who would get it without sending or writing.

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireCronSecret } from "@/lib/support/auth";
import { CREATORS_COLLECTION, listCreators } from "@/lib/creators/db";
import { completeVideoCount } from "@/lib/creators/pay";
import type { PostingDay } from "@/lib/creators/types";
import { claimOnce } from "@/lib/interview";
import { nudgeDateDue, nudgeNeeded } from "@/lib/mobile/nudge";
import { dailyNudge, notify } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const now = new Date();
  const report: Array<Record<string, unknown>> = [];
  try {
    const { db } = getFirebaseAdmin();
    const creators = await listCreators();
    for (const c of creators) {
      const date = nudgeDateDue(c, now, null);
      if (!date) continue;
      const ref = db.collection(CREATORS_COLLECTION).doc(c.id);
      const markerRef = ref.collection("mobile").doc("push");
      const [marker, day, off] = await Promise.all([
        markerRef.get(),
        ref.collection("posting_days").doc(date).get(),
        ref.collection("days_off").doc(date).get(),
      ]);
      if (nudgeDateDue(c, now, marker.exists ? (marker.get("nudge_date") as string) : null) !== date) continue;
      const done = day.exists ? completeVideoCount(day.data() as PostingDay) : 0;
      const dayOff = off.exists && off.get("status") === "approved";
      const row: Record<string, unknown> = { id: c.id, name: c.name, date, done, day_off: dayOff };
      report.push(row);
      if (!nudgeNeeded(done, dayOff)) {
        row.result = "not needed";
        continue;
      }
      if (dry) continue;
      const won = await claimOnce(db, markerRef, (cur) => (cur.nudge_date === date ? null : { nudge_date: date, nudge_at: now.toISOString() }));
      if (!won) {
        row.result = "already sent";
        continue;
      }
      const r = await notify({ creatorId: c.id, email: c.email || null }, dailyNudge(done));
      if (!r || r.sent === 0) {
        await markerRef.update({ nudge_date: FieldValue.delete() }).catch(() => {});
        row.result = r ? "no devices" : "failed";
      } else {
        row.result = "sent";
      }
    }
    return NextResponse.json({ ok: true, dry, checked: creators.length, report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, report }, { status: 500 });
  }
}
