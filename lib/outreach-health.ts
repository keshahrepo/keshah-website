/**
 * Is daily outreach working? Problems show in the founder app's Recruit
 * header and arrive as a push (once per problem, cleared when it works again),
 * plus a short summary push at 1 PM ET on weekdays.
 *
 * Settings/outreach_daily.health:
 *   send    { error, at } | { ok_at }   the 11 AM first-email sends
 *   search  { error, at } | { ok_at }   the daily creator search
 *   noon_alert_date, summary_date        yyyy-mm-dd (ET): each push once a day
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { notifyFounder } from "@/lib/staff";
import { easternNow } from "./outreach-nudges";
import { QUEUE, QUEUE_DEFAULT_CAP } from "./outreach-db";

export type HealthPart = "send" | "search";
const LABEL: Record<HealthPart, string> = { send: "Outreach sending stopped", search: "Creator search isn't running" };

const doc = (db: Firestore) => db.collection("Settings").doc("outreach_daily");

/** Short, readable reason from an error. */
export function reasonOf(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/invalid login|username and password|535/i.test(m)) return "Gmail rejected the password";
  if (/credits|402|insufficient/i.test(m)) return "ScrapeCreators is out of credits";
  if (/401|403|unauthorized|forbidden/i.test(m)) return "an API key stopped working";
  return m.replace(/\s+/g, " ").slice(0, 140);
}

/** Records a failure; pushes the founder the first time (not on every retry). */
export async function healthError(part: HealthPart, e: unknown, store?: Firestore): Promise<void> {
  const db = store ?? getFirebaseAdmin().db;
  const reason = reasonOf(e);
  const cur = ((await doc(db).get()).get("health") ?? {})[part] ?? {};
  await doc(db).set({ health: { [part]: { error: reason, at: new Date().toISOString() } } }, { merge: true });
  if (!cur.error) await notifyFounder({ title: LABEL[part], body: `${reason}. Recruit shows it until it's fixed.`, data: { type: "founder_recruit" } });
}

/** Clears a failure once that part works again. */
export async function healthOk(part: HealthPart, store?: Firestore): Promise<void> {
  const db = store ?? getFirebaseAdmin().db;
  const cur = ((await doc(db).get()).get("health") ?? {})[part] ?? {};
  if (cur.error || !cur.ok_at || Date.now() - Date.parse(cur.ok_at) > 3_600_000) {
    await doc(db).set({ health: { [part]: { error: FieldValue.delete(), at: FieldValue.delete(), ok_at: new Date().toISOString() } } }, { merge: true });
  }
}

/** Warnings for the Recruit header (most serious first). */
export function warningsOf(input: { health: Record<string, { error?: string }>; paused: boolean; queued: number; sentToday: number; cap: number; now: Date }): { level: "red" | "amber"; text: string }[] {
  const out: { level: "red" | "amber"; text: string }[] = [];
  const { weekday, hour } = easternNow(input.now);
  if (input.paused) out.push({ level: "amber", text: "Paused: no first emails go out until it's turned back on" });
  if (input.health.send?.error) out.push({ level: "red", text: `Sending stopped: ${input.health.send.error}` });
  if (input.health.search?.error) out.push({ level: "red", text: `Search isn't running: ${input.health.search.error}` });
  const weekdayNow = weekday >= 1 && weekday <= 5;
  if (!input.paused && weekdayNow && hour >= 12 && input.sentToday === 0 && input.cap > 0) out.push({ level: "red", text: "Nothing has gone out today" });
  // Tomorrow's batch: what's left after today's sends.
  const leftToday = weekdayNow && hour < 16 ? Math.max(0, input.cap - input.sentToday) : 0;
  const forTomorrow = Math.max(0, input.queued - leftToday);
  if (!input.paused && (hour >= 18 || !weekdayNow) && forTomorrow < input.cap) out.push({ level: "amber", text: `Only ${forTomorrow} ready for the next batch (the search is still filling it)` });
  return out;
}

/** Noon check and the 1 PM summary (weekdays, ET), each once a day. */
export async function outreachDailyPushes(opts: { now?: Date; store?: Firestore } = {}): Promise<string[]> {
  const db = opts.store ?? getFirebaseAdmin().db;
  const now = opts.now ?? new Date();
  const { weekday, hour, date } = easternNow(now);
  const sent: string[] = [];
  if (weekday < 1 || weekday > 5 || hour < 12) return sent;
  const s = (await doc(db).get()).data() ?? {};
  if (s.paused === true) return sent;
  const cap = typeof s.cap === "number" ? s.cap : QUEUE_DEFAULT_CAP;
  const sentDocs = (await db.collection(QUEUE).where("status", "==", "sent").get()).docs;
  const sentToday = sentDocs.filter((d) => typeof d.get("sent_at") === "string" && easternNow(new Date(d.get("sent_at"))).date === date).length;
  if (hour === 12 && sentToday === 0 && s.noon_alert_date !== date) {
    await doc(db).set({ noon_alert_date: date }, { merge: true });
    await notifyFounder({ title: "No outreach went out today", body: "Nothing was sent by noon. Check Recruit.", data: { type: "founder_recruit" } });
    sent.push("noon");
  }
  if (hour >= 13 && s.summary_date !== date) {
    const queued = (await db.collection(QUEUE).where("status", "==", "queued").count().get()).data().count;
    const apps = await db.collection("careers_applications").where("source", "==", "tiktok-outreach").get();
    const repliesToday = apps.docs.filter((d) => typeof d.get("replied_at") === "string" && easternNow(new Date(d.get("replied_at"))).date === date).length;
    await doc(db).set({ summary_date: date }, { merge: true });
    await notifyFounder({
      title: `Outreach: ${sentToday} of ${cap} sent today`,
      body: `${repliesToday} ${repliesToday === 1 ? "reply" : "replies"} today · ${Math.max(0, queued)} ready for the next batch`,
      data: { type: "founder_recruit" },
    });
    sent.push("summary");
  }
  return sent;
}
