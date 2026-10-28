// Run: npx tsx --test lib/creators/progress.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { creatorProgress, progressStepSummary, type ProgressInput } from "./progress";

const NOW = new Date("2026-10-14T12:00:00Z"); // a Wednesday

const accepted: ProgressInput = {
  status: "onboarding",
  acceptedAt: "2026-10-01T10:00:00Z",
  accept: { steps: { group: { status: "done", at: "2026-10-01T10:00:01Z", detail: "" }, invite: { status: "done", at: "2026-10-01T10:00:02Z", detail: "Emailed" } } },
  contract: { status: "sent", sent_at: "2026-10-01T10:00:03Z" },
  trackingUrl: "https://link.example/x",
  startDate: "",
  trialPlan: "v2",
};

const state = (p: ReturnType<typeof creatorProgress>) => Object.fromEntries(p.steps.map((s) => [s.key, s.state]));

test("freshly accepted, not signed in: current is the app sign-in, stuck after 2 days", () => {
  const p = creatorProgress(accepted, NOW);
  assert.equal(p.current, "app_signed_in");
  assert.equal(p.steps[0].at, "2026-10-01T10:00:00Z");
  assert.equal(p.steps[1].state, "done");
  assert.equal(p.steps[1].at, "2026-10-01T10:00:02Z");
  assert.equal(p.currentSince, "2026-10-01T10:00:02Z");
  assert.equal(p.days, 13);
  assert.equal(p.stuck, true);
  assert.equal(state(p).contract, "todo");
});

test("not stuck within 2 days", () => {
  const p = creatorProgress(accepted, new Date("2026-10-02T09:00:00Z"));
  assert.equal(p.days, 0);
  assert.equal(p.stuck, false);
});

test("contract sent: clock starts at sent_at when later than sign-in", () => {
  const p = creatorProgress({ ...accepted, appFirstSignedInAt: "2026-10-02T08:00:00Z", contract: { status: "sent", sent_at: "2026-10-12T08:00:00Z" } }, NOW);
  assert.equal(p.current, "contract");
  assert.equal(p.currentSince, "2026-10-12T08:00:00Z");
  assert.equal(p.days, 2);
  assert.equal(p.stuck, true);
  assert.equal(p.steps.find((s) => s.key === "contract")!.waitingOn, "creator");
});

test("contract not sent is on the founder: never stuck", () => {
  const p = creatorProgress({ ...accepted, appFirstSignedInAt: "2026-10-02T08:00:00Z", contract: { status: "none" } }, NOW);
  assert.equal(p.current, "contract");
  assert.equal(p.stuck, false);
  const c = p.steps.find((s) => s.key === "contract")!;
  assert.equal(c.waitingOn, "you");
  assert.equal(c.detail, "Contract not sent yet");
});

test("uses the creator's own step timestamps; unknown sign-in time is done without a date", () => {
  const p = creatorProgress(
    {
      ...accepted,
      contract: { status: "signed", signed_at: "2026-10-03T00:00:00Z" },
      onboarding: { contract_signed_at: "2026-10-03T00:00:00Z", slack_joined_at: "2026-10-04T00:00:00Z", videos_watched: { "reversed-hair-loss": "2026-10-05T00:00:00Z" } },
    },
    NOW,
  );
  const signIn = p.steps.find((s) => s.key === "app_signed_in")!;
  assert.equal(signIn.state, "done");
  assert.equal(signIn.at, null);
  assert.equal(p.steps.find((s) => s.key === "slack")!.at, "2026-10-04T00:00:00Z");
  assert.equal(p.current, "videos");
  // Half-watched videos don't count; since = Slack.
  assert.equal(p.currentSince, "2026-10-04T00:00:00Z");
  assert.equal(p.stuck, true);
});

test("the link doesn't hold up the warm-up; after it, the link waits on the founder (URL and campaign tag)", () => {
  const onboarding = {
    contract_signed_at: "2026-10-03T00:00:00Z",
    slack_joined_at: "2026-10-04T00:00:00Z",
    videos_watched: { "reversed-hair-loss": "2026-10-05T00:00:00Z", "science-of-hair-loss": "2026-10-05T01:00:00Z" },
    quiz_passed_at: "2026-10-05T02:00:00Z",
    accounts_done_at: "2026-10-06T00:00:00Z",
    rules_ack_at: "2026-10-06T02:00:00Z",
  };
  const p = creatorProgress({ ...accepted, contract: { status: "signed" }, trackingUrl: "", onboarding }, NOW);
  assert.equal(p.current, "warmup");
  assert.equal(p.steps.find((s) => s.key === "videos")!.at, "2026-10-05T01:00:00Z");

  const warmed = { ...onboarding, warmup_days: ["2026-10-07", "2026-10-08", "2026-10-09"] };
  const noLink = creatorProgress({ ...accepted, contract: { status: "signed" }, trackingUrl: "", campaignTags: [], onboarding: warmed }, NOW);
  assert.equal(noLink.current, "link");
  assert.equal(noLink.stuck, false);
  const linkStep = noLink.steps.find((s) => s.key === "link")!;
  assert.equal(linkStep.waitingOn, "you");
  assert.equal(linkStep.detail, "Their link isn't set up yet");

  const noTag = creatorProgress({ ...accepted, contract: { status: "signed" }, trackingUrl: "https://x.example/l", campaignTags: [], onboarding: warmed }, NOW);
  assert.equal(noTag.steps.find((s) => s.key === "link")!.waitingOn, "you");
  assert.equal(noTag.steps.find((s) => s.key === "link")!.detail, "Their link has no campaign tag yet");

  const ready = creatorProgress({ ...accepted, contract: { status: "signed" }, trackingUrl: "https://x.example/l", campaignTags: ["Jen TikTok"], onboarding: warmed }, NOW);
  assert.equal(ready.steps.find((s) => s.key === "link")!.waitingOn, "creator");
});

test("warm-up: day count, clock from the last tick", () => {
  const onboarding = {
    contract_signed_at: "2026-10-03T00:00:00Z",
    slack_joined_at: "2026-10-04T00:00:00Z",
    videos_watched: { "reversed-hair-loss": "2026-10-05T00:00:00Z", "science-of-hair-loss": "2026-10-05T01:00:00Z" },
    quiz_passed_at: "2026-10-05T02:00:00Z",
    accounts_done_at: "2026-10-06T00:00:00Z",
    link_seen_at: "2026-10-06T01:00:00Z",
    rules_ack_at: "2026-10-06T02:00:00Z",
    warmup_days: ["2026-10-13"],
  };
  const p = creatorProgress({ ...accepted, contract: { status: "signed" }, onboarding }, NOW);
  assert.equal(p.current, "warmup");
  assert.equal(p.steps.find((s) => s.key === "warmup")!.detail, "1 of 3 days");
  assert.equal(p.currentSince, "2026-10-13");
  assert.equal(p.stuck, false);
  assert.equal(progressStepSummary(p).label, "Warm-up · 1 of 3 days");
});

test("onboarded, waiting for the first posting day counts weekdays only", () => {
  const onboarding = { completed_at: "2026-10-09T15:00:00Z", warmup_days: ["2026-10-07", "2026-10-08", "2026-10-09"] }; // a Friday
  const p = creatorProgress({ ...accepted, status: "trial", contract: { status: "signed" }, onboarding }, new Date("2026-10-11T12:00:00Z"));
  assert.equal(p.current, "first_post");
  assert.equal(p.steps.find((s) => s.key === "slack")!.state, "done");
  assert.equal(p.steps.find((s) => s.key === "slack")!.at, null);
  assert.equal(p.steps.find((s) => s.key === "warmup")!.at, "2026-10-09");
  assert.equal(p.days, 1);
  assert.equal(p.stuck, false); // only the weekend has passed
  const tue = creatorProgress({ ...accepted, status: "trial", contract: { status: "signed" }, onboarding }, new Date("2026-10-13T12:00:00Z"));
  assert.equal(tue.stuck, true);
});

test("running trial is never stuck; reviewing waits on the founder", () => {
  const base = { ...accepted, status: "trial", contract: { status: "signed" }, onboarding: { completed_at: "2026-10-01T00:00:00Z" }, startDate: "2026-09-01" };
  const run = creatorProgress({ ...base, trial: { postedDays: 4, isInTrial: true, requiredDays: 20 } }, NOW);
  assert.equal(run.current, "trial");
  assert.equal(run.stuck, false);
  assert.equal(run.steps.find((s) => s.key === "first_post")!.at, "2026-09-01");
  assert.equal(progressStepSummary(run).label, "Trial day 4 of 20");
  const rev = creatorProgress({ ...base, trial: { postedDays: 20, isInTrial: true, requiredDays: 20, completedOn: "2026-10-01", reviewing: true } }, NOW);
  assert.equal(rev.steps.at(-1)!.waitingOn, "you");
  assert.equal(rev.stuck, false);
});

test("promoted and ended close the timeline", () => {
  const base = { ...accepted, status: "active", contract: { status: "signed" }, startDate: "2026-09-01" };
  const pro = creatorProgress({ ...base, trial: { postedDays: 20, isInTrial: false, completedOn: "2026-09-28", promotedOn: "2026-09-30" } }, NOW);
  assert.equal(pro.current, null);
  assert.equal(pro.steps.at(-1)!.label, "Promoted");
  assert.equal(pro.steps.at(-1)!.at, "2026-09-30");
  assert.equal(progressStepSummary(pro).label, "Done");
  const end = creatorProgress({ ...base, status: "ended", trial: { postedDays: 20, isInTrial: false, completedOn: "2026-09-28", ended: true } }, NOW);
  assert.equal(end.steps.at(-1)!.label, "Ended");
});

test("invite skipped (already had a password) is skipped, not current", () => {
  const p = creatorProgress({ ...accepted, accept: { steps: { invite: { status: "skipped", at: "2026-10-01T00:00:00Z", detail: "x" } } } }, NOW);
  assert.equal(p.steps[1].state, "skipped");
  assert.equal(p.current, "app_signed_in");
  assert.equal(p.currentSince, "2026-10-01T10:00:00Z");
});

test("invite failed: waiting on the founder", () => {
  const p = creatorProgress({ ...accepted, accept: { steps: { invite: { status: "error", at: "2026-10-01T00:00:00Z", detail: "x" } } } }, NOW);
  assert.equal(p.current, "welcome_email");
  assert.equal(p.steps[1].waitingOn, "you");
  assert.equal(p.stuck, false);
  assert.equal(progressStepSummary(p).label, "Welcome email");
});

test("no timestamps anywhere: no since, never stuck", () => {
  const p = creatorProgress({ status: "onboarding", contract: { status: "sent" }, appFirstSignedInAt: null, accept: { steps: {} } }, NOW);
  assert.equal(p.current, "accepted");
  assert.equal(p.currentSince, null);
  assert.equal(p.days, null);
  assert.equal(p.stuck, false);
});

import { appSeenUpdate } from "../mobile/app-seen";

test("app open stamps first sign-in once and last seen hourly", () => {
  const t = new Date("2026-10-14T12:00:00Z");
  assert.deepEqual(appSeenUpdate({}, t), { app_first_signed_in_at: t.toISOString(), app_last_seen_at: t.toISOString() });
  const seen = { app_first_signed_in_at: "2026-10-01T00:00:00Z", app_last_seen_at: "2026-10-14T11:30:00Z" };
  assert.equal(appSeenUpdate(seen, t), null);
  assert.deepEqual(appSeenUpdate({ ...seen, app_last_seen_at: "2026-10-14T10:00:00Z" }, t), { app_last_seen_at: t.toISOString() });
});

test("contract deadline: 'Due Oct 14' while pending, then 'Past due · 1 day' and stuck", () => {
  const base: ProgressInput = {
    ...accepted,
    acceptedAt: "2026-10-11T19:00:00Z",
    appFirstSignedInAt: "2026-10-11T20:00:00Z",
    contract: { status: "sent", sent_at: "2026-10-11T19:00:05Z" },
    contractDeadlineAt: "2026-10-15T03:59:59.000Z",
  };
  const before = creatorProgress(base, new Date("2026-10-12T15:00:00Z"));
  const c1 = before.steps.find((s) => s.key === "contract")!;
  assert.equal(before.current, "contract");
  assert.equal(c1.detail, "Due Oct 14");
  assert.equal(c1.overdue, undefined);
  assert.equal(before.stuck, false);

  const after = creatorProgress(base, new Date("2026-10-15T14:00:00Z"));
  const c2 = after.steps.find((s) => s.key === "contract")!;
  assert.equal(c2.detail, "Past due · 1 day");
  assert.equal(c2.overdue, true);
  assert.equal(after.stuck, true);
  assert.equal(creatorProgress(base, new Date("2026-10-17T14:00:00Z")).steps.find((s) => s.key === "contract")!.detail, "Past due · 3 days");

  // Signed, withdrawn, or not sent yet: no deadline text.
  const signed = creatorProgress({ ...base, contract: { status: "signed", signed_at: "2026-10-16T10:00:00Z" } }, new Date("2026-10-17T14:00:00Z"));
  assert.equal(signed.steps.find((s) => s.key === "contract")!.detail, undefined);
  const withdrawn = creatorProgress({ ...base, withdrawnAt: "2026-10-16T10:00:00Z" }, new Date("2026-10-17T14:00:00Z"));
  assert.equal(withdrawn.steps.find((s) => s.key === "contract")!.overdue, undefined);
  const unsent = creatorProgress({ ...base, contract: { status: "none" } }, new Date("2026-10-17T14:00:00Z"));
  assert.equal(unsent.steps.find((s) => s.key === "contract")!.detail, "Contract not sent yet");
});
