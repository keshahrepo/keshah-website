// Run: npx tsx --test lib/creators/deadline.test.ts
// The 72-hour contract deadline: computation (DST), copy, reminder selection, extend, withdraw.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REMINDER_LEAD_MS,
  contractDeadlineFor,
  creatorDeadline,
  daysPastDue,
  deadlineLong,
  deadlineShort,
  deadlineWeekdayShort,
  extendedDeadline,
  getsDeadline,
  isPastDue,
  offerSummary,
  planExtend,
  planWithdraw,
  reminderDue,
  reminderEmail,
  reminderPush,
  withdrawEmail,
  type OfferDoc,
} from "./deadline";
import { removeCreatorFromGroup, type GroupsClient } from "./google-groups";

const H = 3_600_000;

test("deadline: Sat Oct 11 afternoon -> Tuesday, October 14 at 11:59 PM ET (EDT)", () => {
  const iso = contractDeadlineFor(new Date("2025-10-11T19:30:00Z")); // Sat, 3:30 PM EDT (the founder's example)
  assert.equal(iso, "2025-10-15T03:59:59.000Z");
  assert.equal(deadlineLong(iso), "Tuesday, October 14 at 11:59 PM ET");
  assert.equal(deadlineShort(iso), "Oct 14");
  assert.equal(deadlineWeekdayShort(iso), "Tue, Oct 14");
});

test("deadline: uses the ET date, not UTC (10 PM ET Sunday Oct 11 is already Monday in UTC)", () => {
  assert.equal(contractDeadlineFor(new Date("2026-10-12T02:00:00Z")), "2026-10-15T03:59:59.000Z");
  // 12:30 AM ET Monday counts from Monday.
  assert.equal(contractDeadlineFor(new Date("2026-10-12T04:30:00Z")), "2026-10-16T03:59:59.000Z");
});

test("deadline: DST ends Nov 1. A deadline on the far side is 11:59 PM EST (UTC-5)", () => {
  // Accepted Thu Oct 29 (EDT) -> Sun Nov 1, the day clocks fall back.
  const a = contractDeadlineFor(new Date("2026-10-29T16:00:00Z"));
  assert.equal(a, "2026-11-02T04:59:59.000Z");
  assert.equal(deadlineLong(a), "Sunday, November 1 at 11:59 PM ET");
  // Accepted Fri Oct 30 -> Mon Nov 2.
  assert.equal(contractDeadlineFor(new Date("2026-10-30T16:00:00Z")), "2026-11-03T04:59:59.000Z");
});

test("deadline: DST starts Mar 8. A deadline on the far side is 11:59 PM EDT (UTC-4)", () => {
  const a = contractDeadlineFor(new Date("2026-03-05T17:00:00Z")); // Thu, EST
  assert.equal(a, "2026-03-09T03:59:59.000Z");
  assert.equal(deadlineLong(a), "Sunday, March 8 at 11:59 PM ET");
});

test("getsDeadline: new offers only, never Isai / active / signed", () => {
  assert.equal(getsDeadline({ status: "onboarding" }), true);
  assert.equal(getsDeadline({}), true);
  assert.equal(getsDeadline({ status: "active" }), false);
  assert.equal(getsDeadline({ status: "leaving" }), false);
  assert.equal(getsDeadline({ status: "onboarding", start_date: "2026-09-01" }), false);
  assert.equal(getsDeadline({ status: "onboarding", starting_completed_months: 1 }), false);
  assert.equal(getsDeadline({ status: "onboarding", contract: { status: "signed" } }), false);
});

const DL = "2026-10-15T03:59:59.000Z"; // Wed Oct 14 2026, 11:59 PM EDT
const open: OfferDoc = { status: "onboarding", name: "Jen Park", email: "Jen@Gmail.com", keshah_email: "jen@keshah.com", contract: { status: "sent" }, contract_deadline_at: DL };

test("reminder: only in the last 30 hours, once, and only while it's on the creator", () => {
  const end = Date.parse(DL);
  assert.equal(reminderDue(open, new Date(end - REMINDER_LEAD_MS - 60_000)), false, "too early");
  assert.equal(reminderDue(open, new Date(end - REMINDER_LEAD_MS)), true, "6 PM ET the day before");
  assert.equal(reminderDue(open, new Date(end - 24 * H)), true);
  assert.equal(reminderDue(open, new Date(end + 1000)), false, "past the deadline");
  const now = new Date(end - 24 * H);
  assert.equal(reminderDue({ ...open, contract_reminder_sent_at: "2026-10-13T23:00:00Z" }, now), false, "already sent");
  assert.equal(reminderDue({ ...open, contract: { status: "signed" } }, now), false, "signed");
  assert.equal(reminderDue({ ...open, contract: { status: "none" } }, now), false, "contract not sent yet");
  assert.equal(reminderDue({ ...open, withdrawn_at: "2026-10-13T00:00:00Z" }, now), false, "withdrawn");
  assert.equal(reminderDue({ ...open, status: "trial" }, now), false, "not onboarding");
  assert.equal(reminderDue({ ...open, status: "ended" }, now), false, "ended");
  assert.equal(reminderDue({ ...open, contract_deadline_at: undefined }, now), false, "no deadline");
});

test("reminder copy: push says tomorrow the evening before, tonight after midnight ET; email names the deadline", () => {
  const eve = reminderPush(DL, new Date("2026-10-14T00:00:00Z")); // 8 PM EDT Tue
  assert.equal(eve.title, "Your KESHAH offer is waiting");
  assert.equal(eve.body, "Sign your agreement by tomorrow 11:59 PM ET to keep your spot.");
  assert.equal(reminderPush(DL, new Date("2026-10-14T05:00:00Z")).body, "Sign your agreement by 11:59 PM ET tonight to keep your spot.");
  const m = reminderEmail({ firstName: "Jen", deadlineIso: DL });
  assert.equal(m.subject, "Your KESHAH offer is waiting");
  assert.ok(m.text.startsWith("Hi Jen,"));
  assert.ok(m.text.includes("by Wednesday, October 14 at 11:59 PM ET"));
  assert.ok(m.text.includes("first step when you open the app"));
  assert.ok(m.text.includes("McKenzie"));
  for (const s of [m.subject, m.text, eve.body]) assert.ok(!s.includes("—"), "no em dash");
});

test("past due: day count in ET, at least 1 once passed; summary for the founder app", () => {
  const end = Date.parse(DL);
  assert.equal(daysPastDue(DL, new Date(end - 1000)), 0);
  assert.equal(daysPastDue(DL, new Date(end + 2000)), 1);
  assert.equal(daysPastDue(DL, new Date("2026-10-15T15:00:00Z")), 1); // Thu
  assert.equal(daysPastDue(DL, new Date("2026-10-17T15:00:00Z")), 3); // Sat
  assert.equal(isPastDue(open, new Date(end - 1000)), false);
  assert.equal(isPastDue(open, new Date(end + 60_000)), true);
  assert.equal(isPastDue({ ...open, contract: { status: "signed" } }, new Date(end + 60_000)), false);
  assert.equal(isPastDue({ ...open, withdrawn_at: "x" }, new Date(end + 60_000)), false);
  const s = offerSummary(open, new Date("2026-10-15T15:00:00Z"))!;
  assert.equal(s.open, true);
  assert.equal(s.past_due_days, 1);
  assert.equal(s.short, "Oct 14");
  assert.equal(offerSummary({ status: "onboarding" }, new Date()), null);
  assert.deepEqual(creatorDeadline(open), { deadline_at: DL, deadline_date: "2026-10-14" });
  assert.equal(creatorDeadline({ ...open, contract: { status: "signed" } }), null);
});

test("extend: +48h, reminder reset so a new one goes out before the new deadline, nothing else", () => {
  const now = new Date("2026-10-15T14:00:00Z"); // Thu morning, missed Wednesday
  const p = planExtend({ ...open, contract_reminder_sent_at: "2026-10-14T00:05:00Z" }, now);
  assert.equal(p.deadline, "2026-10-17T03:59:59.000Z");
  assert.equal(deadlineLong(p.deadline), "Friday, October 16 at 11:59 PM ET");
  assert.deepEqual(Object.keys(p.updates).sort(), ["contract_deadline_at", "contract_deadline_extended_at", "contract_reminder_sent_at"]);
  assert.equal(p.updates.contract_reminder_sent_at, null);
  // The reset reminder is due again 30h before the new deadline.
  const after = { ...open, ...p.updates } as OfferDoc;
  assert.equal(reminderDue(after, new Date(Date.parse(p.deadline) - 24 * H)), true);
  assert.equal(reminderDue(after, now), false);
});

test("extend: when +48h would leave under a day, it's 11:59 PM ET two days from now", () => {
  assert.equal(extendedDeadline(DL, new Date("2026-10-17T02:00:00Z")), "2026-10-19T03:59:59.000Z"); // Fri 10 PM ET -> Sun
  assert.throws(() => planExtend({ ...open, contract: { status: "signed" } }, new Date()), /already signed/);
  assert.throws(() => planExtend({ ...open, withdrawn_at: "x" }, new Date()), /withdrawn/);
  assert.throws(() => planExtend({ status: "onboarding" }, new Date()), /no contract deadline/);
});

test("withdraw: status ended + withdrawn_at, polite email, group to leave", () => {
  const now = new Date("2026-10-16T15:00:00Z");
  const p = planWithdraw(open, now, "America/Los_Angeles");
  assert.deepEqual(p.updates, { status: "ended", status_changed_at: now.toISOString(), ended_on: "2026-10-16", withdrawn_at: now.toISOString() });
  assert.equal(p.groupEmail, "jen@keshah.com");
  assert.equal(p.email!.to, "jen@gmail.com");
  assert.equal(p.email!.subject, "Your KESHAH offer");
  assert.ok(p.email!.text.startsWith("Hi Jen,\n\nWe weren't able to confirm your spot"));
  assert.ok(p.email!.text.includes("by Wednesday, October 14 at 11:59 PM ET"));
  assert.ok(!p.email!.text.includes("—"));
  assert.throws(() => planWithdraw({ ...open, contract: { status: "signed" } }, now, ""), /already signed/);
  assert.throws(() => planWithdraw({ ...open, withdrawn_at: "x" }, now, ""), /already withdrawn/);
  assert.throws(() => planWithdraw({ ...open, status: "active" }, now, ""), /still being set up/);
  assert.equal(planWithdraw({ ...open, email: "" }, now, "").email, null);
  assert.ok(!withdrawEmail({ firstName: "", deadlineIso: null }).text.includes(" by "));
});

test("withdraw: removes the personal address from the group (404 = already gone), keeps the group", async () => {
  const calls: { method: string; url: string }[] = [];
  const mk = (status: number): GroupsClient => ({
    adminEmail: "admin@keshah.com",
    fetch: async (url, init = {}) => {
      calls.push({ method: init.method ?? "GET", url });
      return new Response(status === 204 ? null : JSON.stringify({ error: { message: "nope" } }), { status });
    },
  });
  assert.deepEqual(await removeCreatorFromGroup(mk(204), { groupEmail: "jen@keshah.com", personalEmail: "Jen@Gmail.com" }), { removed: true });
  assert.equal(calls[0].method, "DELETE");
  assert.equal(calls[0].url, "https://admin.googleapis.com/admin/directory/v1/groups/jen%40keshah.com/members/jen%40gmail.com");
  assert.deepEqual(await removeCreatorFromGroup(mk(404), { groupEmail: "jen@keshah.com", personalEmail: "jen@gmail.com" }), { removed: false });
  await assert.rejects(removeCreatorFromGroup(mk(403), { groupEmail: "jen@keshah.com", personalEmail: "jen@gmail.com" }), /failed/);
  await assert.rejects(removeCreatorFromGroup(mk(204), { groupEmail: "jen@gmail.com", personalEmail: "x@y.com" }), /keshah/);
  assert.ok(calls.every((c) => c.method === "DELETE"));
});
