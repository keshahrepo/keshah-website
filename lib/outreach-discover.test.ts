import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCreator, personalLine, searchHits } from "./outreach-discover";

const now = Date.parse("2026-10-28T12:00:00Z");
const s = (daysAgo: number) => now / 1000 - daysAgo * 86400;
const talk = (daysAgo: number, plays: number) => ({ create_time: s(daysAgo), statistics: { play_count: plays }, video: { cla_info: { caption_infos: [{}], has_original_audio: 1 }, cover: { url_list: [`https://c/${daysAgo}.heic`, `https://c/${daysAgo}.jpeg`] } }, author: { signature: "hi! 📩 me@x.com", nickname: "Abbie", follower_count: 5000 } });

test("checkCreator: passes a frequent, talking, watched creator with an email", () => {
  const r = checkCreator({ aweme_list: [1, 2, 3, 4, 5, 6, 8, 10].map((d) => talk(d, 2000)) }, now);
  assert.equal(r.ok, true, r.why);
  assert.equal(r.email, "me@x.com");
  assert.equal(r.covers.length, 3);
  assert.ok(r.covers.every((u) => u.endsWith(".jpeg")), "the JPEG copy of each cover");
});

test("checkCreator: names what fails", () => {
  const quiet = checkCreator({ aweme_list: [20, 30, 40, 50, 60].map((d) => talk(d, 100)) }, now);
  assert.equal(quiet.ok, false);
  assert.match(quiet.why, /infrequent/);
  assert.match(quiet.why, /low views/);
  const noEmail = checkCreator({ aweme_list: [1, 2, 3, 4, 5, 6].map((d) => ({ ...talk(d, 2000), author: { signature: "no email here" } })) }, now);
  assert.match(noEmail.why, /no email/);
  assert.equal(checkCreator({}, now).ok, false);
});

test("searchHits: US, 100 to 30,000 followers, one per handle", () => {
  const it = (h: string, f: number, region = "US") => ({ aweme_info: { region, author: { unique_id: h, follower_count: f, nickname: h } } });
  const hits = searchHits({ search_item_list: [it("a", 150), it("A", 150), it("b", 50), it("c", 40000), it("d", 5000, "GB"), it("e", 30000)] });
  assert.deepEqual(hits.map((h) => h.handle), ["a", "e"]);
});

test("personalLine: the template, a clean name, or null when unusable", () => {
  const l = personalLine({ video: "your GoodNotes tutorial.", skill: "explain", first_name: "Abbie", ok: true });
  assert.equal(l?.greet, "Hey Abbie,");
  assert.equal(l?.line, "I came across your GoodNotes tutorial on TikTok, and you're really good at explaining things simply. That's exactly what we look for.");
  assert.equal(personalLine({ video: "x video", skill: "story", first_name: "🌸abbie🌸", ok: true })?.greet, "Hey,");
  assert.equal(personalLine({ video: "x video", skill: "story", first_name: "", ok: false }), null);
  assert.equal(personalLine({ video: "x video", skill: "dance", first_name: "", ok: true }), null);
});
