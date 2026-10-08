/**
 * The founder's call at the end of a v2 trial (20 posting days at 3 videos).
 * Only possible once all 20 days are in; nothing happens automatically.
 *
 *   keep  -> status "active"; the full plan starts the weekday after today
 *   end   -> status "ended", ended_on = the 20th trial day (paid all $300)
 *   undo  -> back to "waiting for a decision" (a mis-tap)
 *
 * The creator gets a push either way; the app shows the result.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { notify } from "@/lib/push";
import { CREATORS_COLLECTION, CreatorDataError, isYyyyMmDd, toPostingDay } from "./db";
import { localDate, trialWindow } from "./pay";
import type { YyyyMmDd } from "./types";

export type TrialDecision = "keep" | "end" | "undo";

export async function decideTrial(id: string, decision: TrialDecision, opts: { now?: Date } = {}) {
  const db = getFirebaseAdmin().db;
  const ref = db.collection(CREATORS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const d = snap.data()!;
  if (d.trial_plan !== "v2" || !isYyyyMmDd(d.start_date)) throw new CreatorDataError("This creator isn't on the 20-day trial");
  const days = await ref.collection("posting_days").get();
  const tw = trialWindow({ start_date: d.start_date, trial_plan: "v2" }, days.docs.map((x) => toPostingDay(x.id, x.data())));
  if (!tw?.completedOn) throw new CreatorDataError(`The trial isn't done yet (${tw?.days.length ?? 0} of 20 days)`);
  const now = opts.now ?? new Date();
  const today = localDate(now.toISOString(), d.timezone || "UTC") as YyyyMmDd;
  const at = now.toISOString();

  if (decision === "undo") {
    await ref.update({
      trial_outcome: FieldValue.delete(),
      trial_decided_on: FieldValue.delete(),
      status: "trial",
      status_changed_at: at,
      ...(d.trial_outcome === "end" && d.ended_on === tw.completedOn ? { ended_on: FieldValue.delete() } : {}),
    });
    return { outcome: null };
  }
  if (d.trial_outcome) throw new CreatorDataError(`Already decided (${d.trial_outcome}). Undo first to change it.`);

  if (decision === "keep") {
    await ref.update({ trial_outcome: "keep", trial_decided_on: today, status: "active", status_changed_at: at });
    await notify(
      { creatorId: id, email: d.email || null },
      { title: "You made it", body: "You passed your trial. Open the app to see what changes.", data: { type: "trial_decision" } },
    );
    return { outcome: "keep" as const, decided_on: today };
  }
  await ref.update({ trial_outcome: "end", trial_decided_on: today, status: "ended", status_changed_at: at, ended_on: tw.completedOn });
  await notify(
    { creatorId: id, email: d.email || null },
    { title: "Your trial results", body: "Open the app to see the result of your trial.", data: { type: "trial_decision" } },
  );
  return { outcome: "end" as const, decided_on: today };
}
