import { test } from "node:test";
import assert from "node:assert/strict";
import { getStartedDue, getStartedEmail, setupNudgeKind, setupNudgePush, setupState, type SetupStepKey } from "./setup-deadline";

const all = (v: boolean): Record<SetupStepKey, boolean> => ({ contract: v, slack: v, videos: v, quiz: v, accounts: v, link: v });
const base = { timezone: "America/Toronto", signedAt: "2026-10-15T17:35:22Z", trackingUrl: "https://keshah.com/andrew" };

test("due 3 days after the signing day, in their timezone", () => {
  const st = setupState({ ...base, steps: { ...all(false), contract: true, slack: true } }, new Date("2026-10-16T15:00:00Z"));
  assert.equal(st.due_date, "2026-10-18");
  assert.equal(st.steps_left, 4);
  assert.equal(st.next_step, "videos");
  assert.equal(st.overdue_days, 0);
});

test("overdue counts calendar days after the due date", () => {
  const st = setupState({ ...base, steps: { ...all(false), contract: true } }, new Date("2026-10-20T16:00:00Z"));
  assert.equal(st.overdue_days, 2);
});

test("Give 3 more days moves the due date", () => {
  const st = setupState({ ...base, steps: { ...all(false), contract: true }, extraDays: 3 }, new Date("2026-10-20T16:00:00Z"));
  assert.equal(st.due_date, "2026-10-21");
  assert.equal(st.overdue_days, 0);
});

test("paused while the link step waits on our tracking link", () => {
  const st = setupState({ ...base, trackingUrl: "", steps: { ...all(true), link: false } }, new Date("2026-10-25T16:00:00Z"));
  assert.equal(st.waiting_on_us, true);
  assert.equal(st.overdue_days, 0);
});

test("a late tracking link gives at least a day from when it arrived", () => {
  const st = setupState({ ...base, trackingUrlSetAt: "2026-10-22T14:00:00Z", steps: { ...all(true), link: false } }, new Date("2026-10-23T16:00:00Z"));
  assert.equal(st.due_date, "2026-10-23");
  assert.equal(st.overdue_days, 0);
});

test("a missing tracking link doesn't pause the clock while other steps are left", () => {
  const st = setupState({ ...base, trackingUrl: "", steps: { ...all(false), contract: true } }, new Date("2026-10-20T16:00:00Z"));
  assert.equal(st.waiting_on_us, false);
  assert.equal(st.overdue_days, 2);
});

test("done: no due pressure, nothing left", () => {
  const st = setupState({ ...base, steps: all(true) }, new Date("2026-10-30T16:00:00Z"));
  assert.equal(st.done, true);
  assert.equal(st.overdue_days, 0);
  assert.equal(st.next_step, null);
});

test("not signed yet: no due date", () => {
  const st = setupState({ ...base, signedAt: null, steps: all(false) }, new Date("2026-10-16T15:00:00Z"));
  assert.equal(st.due_date, null);
  assert.equal(st.next_step, "contract");
});

test("nudge: daily from the day after signing, last day on the due date, none after", () => {
  const st = setupState({ ...base, steps: { ...all(false), contract: true, slack: true } }, new Date("2026-10-16T15:00:00Z"));
  assert.equal(setupNudgeKind(st, "2026-10-15", "2026-10-15"), null);
  assert.equal(setupNudgeKind(st, "2026-10-16", "2026-10-15"), "daily");
  assert.equal(setupNudgeKind(st, "2026-10-18", "2026-10-15"), "last_day");
  assert.equal(setupNudgeKind(st, "2026-10-19", "2026-10-15"), null);
  assert.match(setupNudgePush("daily", st).body, /4 steps left\. Next: watch the Learn KESHAH videos\./);
});

const offer = {
  status: "onboarding",
  contract: { status: "sent" },
  accepted_at: "2026-10-15T14:00:00Z",
  contract_deadline_at: "2026-10-19T03:59:59Z",
};

test("Get started: 24h after the offer, not signed in, before the final reminder window", () => {
  assert.equal(getStartedDue(offer, new Date("2026-10-16T13:00:00Z")), false);
  assert.equal(getStartedDue(offer, new Date("2026-10-16T15:00:00Z")), true);
  assert.equal(getStartedDue(offer, new Date("2026-10-17T23:00:00Z")), false);
  assert.equal(getStartedDue({ ...offer, app_first_signed_in_at: "2026-10-15T15:00:00Z" }, new Date("2026-10-16T15:00:00Z")), false);
  assert.equal(getStartedDue({ ...offer, get_started_sent_at: "2026-10-16T14:30:00Z" }, new Date("2026-10-16T15:00:00Z")), false);
  assert.equal(getStartedDue({ ...offer, contract: { status: "signed" } }, new Date("2026-10-16T15:00:00Z")), false);
});

test("Get started email names the app, the sign-in email and the deadline", () => {
  const m = getStartedEmail({ firstName: "Andrew", appUrl: "https://testflight.apple.com/join/x", signInEmail: "andrew@example.com", deadlineIso: offer.contract_deadline_at });
  assert.equal(m.subject, "Your KESHAH spot is waiting");
  assert.match(m.text, /Sign in with andrew@example\.com/);
  assert.match(m.text, /open until Sunday, October 18 at 11:59 PM ET/);
  assert.match(m.text, /McKenzie/);
});

test("a founder-set due date replaces 3-days-after-signing, and Give 3 more days adds to it", () => {
  const st = setupState({ ...base, dueOverride: "2026-10-22", steps: { ...all(false), contract: true } }, new Date("2026-10-21T16:00:00Z"));
  assert.equal(st.due_date, "2026-10-22");
  assert.equal(st.overdue_days, 0);
  assert.equal(st.due_override, "2026-10-22");
  assert.equal(setupState({ ...base, dueOverride: "2026-10-22", extraDays: 3, steps: { ...all(false), contract: true } }, new Date("2026-10-21T16:00:00Z")).due_date, "2026-10-25");
});

test("a later due date only gets reminders in its last 3 days", () => {
  const st = setupState({ ...base, dueOverride: "2026-10-22", steps: { ...all(false), contract: true } }, new Date("2026-10-17T16:00:00Z"));
  assert.equal(setupNudgeKind(st, "2026-10-17", "2026-10-15"), null);
  assert.equal(setupNudgeKind(st, "2026-10-19", "2026-10-15"), null);
  assert.equal(setupNudgeKind(st, "2026-10-20", "2026-10-15"), "daily");
  assert.equal(setupNudgeKind(st, "2026-10-22", "2026-10-15"), "last_day");
});

test("not signed but a date was agreed: it shows, and isn't overdue before they sign", () => {
  const st = setupState({ ...base, signedAt: null, dueOverride: "2026-10-22", steps: all(false) }, new Date("2026-10-25T16:00:00Z"));
  assert.equal(st.due_date, "2026-10-22");
  assert.equal(st.overdue_days, 0);
});
