// Deep dive on the "paid but never opened Day 1" users — where they are,
// whether they submitted a starter photo, how long since purchase, etc.

import { getFirebaseAdmin } from "../lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

const RELEASE_CUTOFF = new Date("2026-08-18T00:00:00Z");

function tsToDate(raw: unknown): Date | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as { toDate?: () => Date; _seconds?: number; seconds?: number };
  if (typeof t.toDate === "function") return t.toDate();
  const s = t._seconds ?? t.seconds;
  return typeof s === "number" ? new Date(s * 1000) : null;
}

function hoursAgo(d: Date | null): string {
  if (!d) return "-";
  const h = (Date.now() - d.getTime()) / 3600000;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

async function main() {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(RELEASE_CUTOFF))
    .select(
      "started_trial",
      "progress",
      "subscription_status",
      "email",
      "first_name",
      "starter_photos_submit_submitted_once",
      "userLocalTimeZone",
      "country_tier",
      "selected_gender",
      "onboarding_call_booked_at",
      "onboarding_call_scheduled_start",
    )
    .get();

  console.log(`\n${"Email".padEnd(35)} ${"TZ".padEnd(24)} ${"Photo?".padEnd(8)} ${"Onboarding call?".padEnd(24)} ${"Trial started".padEnd(15)}`);
  console.log("-".repeat(120));

  const rows: string[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (/^test\d+@test\.com$/i.test(d.email ?? "")) continue;
    if (!d.started_trial) continue;
    if (d.subscription_status === "cancelled") continue;

    const progress = (d.progress as Record<string, Array<unknown> | undefined> | undefined) ?? {};
    const day1 = progress["day1"];
    const opened = Array.isArray(day1) && day1.length > 0;
    if (opened) continue;

    const startedAt = tsToDate((d.started_trial as { at?: unknown } | undefined)?.at);
    const email = (d.email as string) ?? "-";
    const tz = (d.userLocalTimeZone as string) ?? "-";
    const photo = d.starter_photos_submit_submitted_once === true ? "✓" : "-";
    const callBooked = tsToDate(d.onboarding_call_booked_at);
    const callScheduled = tsToDate(d.onboarding_call_scheduled_start);
    const callStatus = callScheduled
      ? `✓ ${callScheduled.toISOString().slice(0, 16).replace("T", " ")}`
      : callBooked ? "✓ (no start)" : "-";

    rows.push(
      `${email.padEnd(35)} ${tz.padEnd(24)} ${photo.padEnd(8)} ${callStatus.padEnd(24)} ${hoursAgo(startedAt).padEnd(15)}`
    );
  }

  for (const r of rows) console.log(r);
  console.log(`\n${rows.length} users.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
