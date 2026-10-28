import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanNotes, parseResearch, researchPrompt, transcriptPick } from "./outreach-notes";

const now = Date.parse("2026-10-28T12:00:00Z");
const sec = (d: string) => Date.parse(d) / 1000;

test("parseResearch pulls counts, bio and videos", () => {
  const r = parseResearch(
    "abbie_groy",
    { user: { nickname: "abbie groy", signature: "welcome\nto my world" }, stats: { followerCount: 24800, heartCount: 1800000, videoCount: 215 } },
    { aweme_list: [{ aweme_id: "1", desc: "GoodNotes", statistics: { play_count: 1000000 }, create_time: sec("2026-08-05T12:00:00Z") }] },
    now,
  );
  assert.equal(r.followers, 24800);
  assert.equal(r.bio, "welcome to my world");
  assert.equal(r.videos[0].plays, 1000000);
  assert.equal(r.videos[0].days_ago, 84);
  assert.equal(r.videos[0].url, "https://www.tiktok.com/@abbie_groy/video/1");
});

test("transcriptPick: best of the last 30 days, else best overall", () => {
  const v = (plays: number, days_ago: number) => ({ desc: "", plays, days_ago, url: String(plays) });
  const base = { handle: "x", nickname: "", bio: "", followers: 1, likes: 1, video_count: 1, transcript: null };
  assert.equal(transcriptPick({ ...base, videos: [v(1_000_000, 90), v(5000, 3), v(800, 1)] })?.plays, 5000);
  assert.equal(transcriptPick({ ...base, videos: [v(1_000_000, 90), v(50, 60)] })?.plays, 1_000_000);
  assert.equal(transcriptPick({ ...base, videos: [] }), null);
});

test("cleanNotes keeps the shape, caps lists, drops em dashes, rejects junk", () => {
  const n = cleanNotes({ fit: "strong", summary: "Talks to camera — daily.", mention: ["a", "b", "c", "d"], watch: ["x"], ask: [] });
  assert.deepEqual(n, { fit: "Strong", summary: "Talks to camera, daily.", mention: ["a", "b", "c"], watch: ["x"], ask: [] });
  assert.equal(cleanNotes({ fit: "Great", summary: "x" }), null);
  assert.equal(cleanNotes({ fit: "Good", summary: "" }), null);
});

test("researchPrompt includes our line, their reply and the transcript", () => {
  const p = researchPrompt("Abbie", "I saw your GoodNotes tutorial", "Happy to chat", {
    handle: "abbie_groy", nickname: "", bio: "", followers: 1, likes: 2, video_count: 3,
    videos: [{ desc: "GoodNotes", plays: 1000000, days_ago: 84, url: "" }],
    transcript: { desc: "hair", plays: 2336, text: "Hi, I am a waitress" },
  });
  assert.match(p, /GoodNotes tutorial/);
  assert.match(p, /Happy to chat/);
  assert.match(p, /I am a waitress/);
  assert.match(p, /1,000,000 plays/);
});

test("cleanVideoPhrase: short natural phrase, no 'your', hashtags or em dashes", async () => {
  const { cleanVideoPhrase } = await import("./outreach-notes");
  assert.equal(cleanVideoPhrase("your move-in day video."), "move-in day video");
  assert.equal(cleanVideoPhrase("storytime — the man in a suit #storytime"), "storytime, the man in a suit");
  assert.equal(cleanVideoPhrase(""), "");
  assert.equal(cleanVideoPhrase("a very long phrase that goes on and on about many many things in the video"), "");
});
