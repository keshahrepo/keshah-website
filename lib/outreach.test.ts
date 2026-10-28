// Run: npx tsx --test lib/outreach.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { addressOf, recruitStage, replySnippet } from "./outreach";

test("stages follow the pipeline", () => {
  assert.equal(recruitStage({ status: "emailed" }), "emailed");
  assert.equal(recruitStage({ status: "replied" }), "replied");
  assert.equal(recruitStage({ status: "booked" }), "booked");
  assert.equal(recruitStage({ status: "booked", interview_video_submitted_at: "x" }), "review");
  assert.equal(recruitStage({ status: "denied" }), "passed");
  assert.equal(recruitStage({ status: "accepted" }, { contract_signed: false, started: false, status: "onboarding" }), "offered");
  assert.equal(recruitStage({ status: "accepted" }, { contract_signed: true, started: false, status: "onboarding" }), "onboarding");
  assert.equal(recruitStage({ status: "accepted" }, { contract_signed: true, started: true, status: "trial" }), "posting");
  assert.equal(recruitStage({ status: "accepted" }, { contract_signed: true, started: false, status: "ended" }), "passed");
  assert.equal(recruitStage({ status: "awaiting_booking" }), "applied");
});

test("reply snippet drops the quoted email", () => {
  const t = "Hi Aadi, I'd love to chat!\n\nBest, Jay\n\nOn Mon, Oct 26, 2026 at 10:07 AM Aadi from KESHAH <contact@keshah.com> wrote:\n> Hey Jay,\n> I'm Aadi";
  assert.equal(replySnippet(t), "Hi Aadi, I'd love to chat! Best, Jay");
  assert.equal(addressOf("Jay <JaySTedTalk@gmail.com>"), "jaystedtalk@gmail.com");
});
