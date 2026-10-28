import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarNudge, greeting, inSendWindow, noReplyNudge, nudgeDue, replySubject } from "./outreach-nudges";

const now = Date.parse("2026-10-29T14:00:00Z"); // Thursday 10 AM ET

test("nudgeDue: noreply 48h after our email, calendar 48h after the link, once each", () => {
  assert.equal(nudgeDue({ status: "emailed", emailed_at: "2026-10-27T13:00:00Z" }, now), "noreply");
  assert.equal(nudgeDue({ status: "emailed", emailed_at: "2026-10-27T15:00:00Z" }, now), null);
  assert.equal(nudgeDue({ status: "emailed", emailed_at: "2026-10-26T14:00:00Z", nudge_noreply_sent_at: "x" }, now), null);
  assert.equal(nudgeDue({ status: "emailed", emailed_at: "2026-10-26T14:00:00Z", nudge_skipped: { noreply: "you wrote to them since" } }, now), null);
  assert.equal(nudgeDue({ status: "invited", calendar_sent_at: "2026-10-27T10:00:00Z" }, now), "calendar");
  assert.equal(nudgeDue({ status: "invited", calendar_sent_at: "2026-10-28T10:00:00Z" }, now), null);
  assert.equal(nudgeDue({ status: "replied", emailed_at: "2026-10-20T10:00:00Z" }, now), null);
  assert.equal(nudgeDue({ status: "booked", calendar_sent_at: "2026-10-20T10:00:00Z" }, now), null);
});

test("inSendWindow: weekday 9 AM to noon ET only", () => {
  assert.equal(inSendWindow(new Date("2026-10-29T14:00:00Z")), true); // Thu 10 AM
  assert.equal(inSendWindow(new Date("2026-10-29T12:30:00Z")), false); // Thu 8:30 AM
  assert.equal(inSendWindow(new Date("2026-10-29T16:30:00Z")), false); // Thu 12:30 PM
  assert.equal(inSendWindow(new Date("2026-10-31T14:00:00Z")), false); // Sat
  assert.equal(inSendWindow(new Date("2026-11-02T15:00:00Z")), true); // Mon 10 AM EST
});

test("noReplyNudge names their other video, else says they'd be a great fit", () => {
  const a = noReplyNudge("Hey Abbie,", "move-in day video");
  assert.match(a, /^Hey Abbie,\n\nQuick update since my last email: we've just added a \$1,000\/month option for select creators, and after seeing your move-in day video, I think you'd be a great fit\./);
  assert.match(a, /calendly\.com\/aadi-keshah\/creator-interview\n\nAadi$/);
  assert.match(noReplyNudge("Hey Ben,", null), /select creators, and I think you'd be a great fit\./);
  for (const s of [a, calendarNudge("Hey Raf,")]) assert.ok(!s.includes("—"));
});

test("greeting and reply subject", () => {
  assert.equal(greeting({ outreach_greet: "Hey Abbie,", full_name: "Abbie Groy" }), "Hey Abbie,");
  assert.equal(greeting({ full_name: "Raf" }), "Hey Raf,");
  assert.equal(replySubject("Paid collab, $500/month"), "Re: Paid collab, $500/month");
  assert.equal(replySubject("Re: Paid collab"), "Re: Paid collab");
});
