/**
 * Daily health check for the creator system. Emails the founder only when
 * something needs a look, at most once a day per distinct set of problems:
 *
 *   - ScrapeCreators credits running low (post detection stops at 0)
 *   - the post sync failing for a creator, or not succeeding for over a day
 *   - a posting creator with no posts found for 2+ weekdays (renamed / private handle?)
 *   - the usable proven library getting small (creators start repeating)
 *   - proven videos stuck without talking points after every retry
 */
import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { emailConfigured, sendEmail } from "@/lib/email";
import { CREATORS_COLLECTION } from "./db";
import { PROVEN_COLLECTION } from "./proven";
import { BEATS_MAX_ATTEMPTS } from "./proven-beats";

export const LOW_CREDITS = 1500;
export const MIN_USABLE_VIDEOS = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreatorHealthInput {
  name: string;
  status: string;
  start_date?: string;
  post_sync?: { last_ok_at?: string; consecutive_failures?: number; credits_remaining?: number | null };
  /** Newest detected post (ISO), if any. */
  newest_post_at?: string | null;
}

export interface ProvenHealthInput {
  status?: string;
  talking_points?: unknown[];
  hook_first_person?: boolean;
  transcript?: string;
  beats?: { attempts?: number; last_error?: string };
}

/** Weekdays strictly between two instants (rough, UTC). */
function weekdaysSince(fromMs: number, toMs: number): number {
  let n = 0;
  for (let t = fromMs + DAY_MS; t <= toMs; t += DAY_MS) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

/** Problems worth an email, as plain lines. Pure. */
export function healthProblems(creators: CreatorHealthInput[], proven: ProvenHealthInput[], nowMs: number): string[] {
  const out: string[] = [];
  const posting = creators.filter((c) => c.status === "trial" || c.status === "active");

  const credits = creators.map((c) => c.post_sync?.credits_remaining).filter((x): x is number => typeof x === "number");
  if (credits.length) {
    const left = Math.min(...credits);
    if (left < LOW_CREDITS) out.push(`ScrapeCreators credits are low: ${left} left. Post detection stops at 0, which would look like missed days. Top up at scrapecreators.com.`);
  }

  for (const c of posting) {
    const ps = c.post_sync ?? {};
    const lastOk = ps.last_ok_at ? Date.parse(ps.last_ok_at) : 0;
    if ((ps.consecutive_failures ?? 0) >= 2) out.push(`Post sync is failing for ${c.name} (${ps.consecutive_failures} times in a row).`);
    else if (lastOk && nowMs - lastOk > DAY_MS) out.push(`Post sync hasn't worked for ${c.name} in over a day.`);

    const started = c.start_date && Date.parse(`${c.start_date}T00:00:00Z`) <= nowMs;
    if (started) {
      const since = Math.max(c.newest_post_at ? Date.parse(c.newest_post_at) : 0, Date.parse(`${c.start_date}T00:00:00Z`));
      const gap = weekdaysSince(since, nowMs);
      if (gap >= 2) out.push(`No posts found for ${c.name} in ${gap} weekdays. Check their handles are right and the accounts are public.`);
    }
  }

  const active = proven.filter((v) => v.status === "active");
  const usable = active.filter((v) => (v.talking_points?.length ?? 0) > 0 && !v.hook_first_person).length;
  if (active.length && usable < MIN_USABLE_VIDEOS) {
    out.push(`Only ${usable} videos are ready to hand out. Creators will start repeating videos soon. Approve more in Creator pay > Proven videos.`);
  }
  const stuck = active.filter(
    (v) => !(v.talking_points?.length) && (v.transcript ?? "").trim().length >= 80 && (v.beats?.attempts ?? 0) >= BEATS_MAX_ATTEMPTS,
  ).length;
  if (stuck) out.push(`${stuck} approved video${stuck === 1 ? "" : "s"} couldn't get talking points after ${BEATS_MAX_ATTEMPTS} tries, so ${stuck === 1 ? "it isn't" : "they aren't"} handed out.`);
  return out;
}

export function alertEmailTo(): string | null {
  return process.env.CREATOR_ALERT_EMAIL || process.env.GOOGLE_ADMIN_EMAIL || null;
}

/** Runs the check and emails when there are problems (deduped per day). */
export async function runCreatorHealth(opts: { db?: Firestore; dry?: boolean; now?: Date } = {}) {
  const db = opts.db ?? getFirebaseAdmin().db;
  const now = opts.now ?? new Date();
  const snap = await db.collection(CREATORS_COLLECTION).get();
  const creators: CreatorHealthInput[] = [];
  for (const d of snap.docs) {
    const x = d.data();
    const status = String(x.status ?? "");
    let newest: string | null = null;
    if (status === "trial" || status === "active") {
      const p = await d.ref.collection("posts").orderBy("posted_at", "desc").limit(1).get();
      newest = (p.docs[0]?.data().posted_at as string | undefined) ?? null;
    }
    creators.push({ name: String(x.name ?? d.id), status, start_date: x.start_date, post_sync: x.post_sync, newest_post_at: newest });
  }
  const pv = await db
    .collection(PROVEN_COLLECTION)
    .where("status", "==", "active")
    .select("status", "talking_points", "hook_first_person", "transcript", "beats")
    .get();
  const problems = healthProblems(creators, pv.docs.map((d) => d.data() as ProvenHealthInput), now.getTime());
  const to = alertEmailTo();
  const out = { problems, emailed: false, to };
  if (!problems.length || opts.dry || !to || !emailConfigured()) return out;

  const key = `${now.toISOString().slice(0, 10)}|${problems.join("|")}`;
  const ref = db.collection("Settings").doc("creator_health");
  const last = (await ref.get()).data()?.last_alert_key;
  if (last === key) return out;
  await sendEmail({
    to,
    fromName: "KESHAH creator system",
    subject: `Creator system: ${problems.length} thing${problems.length === 1 ? "" : "s"} to check`,
    text: `${problems.map((p) => `- ${p}`).join("\n")}\n\nDashboard: https://www.keshah.com/dashboard/creators-pay`,
  });
  await ref.set({ last_alert_key: key, last_alert_at: now.toISOString() }, { merge: true });
  return { ...out, emailed: true };
}
