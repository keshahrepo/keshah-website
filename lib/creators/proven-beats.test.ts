// Run: npx tsx --test lib/creators/proven-beats.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";
import { BEATS_MAX_ATTEMPTS, beatProblem, beatsFor, cleanCta, generateProvenBeats, needsBeats, parseBeats, tidyLine } from "./proven-beats";

const TRANSCRIPT =
  "Pinch the top of your scalp right now. Now pinch the sides. The top feels way tighter, right? That's restricting blood flow to your follicles. I fixed my own hair this way. Check my pinned video for the full routine.";

const GOOD = JSON.stringify({
  beats: [
    "For most people losing hair, the scalp on top is tighter than the sides.",
    "A tight scalp squeezes the blood vessels — so blood can't reach the hair.",
    "Without enough blood, the hair usually gets thinner and falls out.",
    "Scalp exercises every day can loosen it up",
  ],
  cta: "Check my pinned video, it's the first one on my profile.",
});

test("needsBeats: active proven videos with a transcript and no points, under the attempt cap", () => {
  const base = { status: "active" as const, added_by: "seed" as const, transcript: TRANSCRIPT };
  assert.equal(needsBeats(base), true);
  assert.equal(needsBeats({ ...base, talking_points: ["x"] }), false);
  assert.equal(needsBeats({ ...base, status: "suggested" }), false);
  assert.equal(needsBeats({ ...base, added_by: "founder_idea" }), false);
  assert.equal(needsBeats({ ...base, transcript: "watch until the end!!" }), false);
  assert.equal(needsBeats({ ...base, beats: { attempts: BEATS_MAX_ATTEMPTS } }), false);
});

test("tidyLine: dashes become commas, quotes go, ends with a full stop", () => {
  assert.equal(tidyLine("- a tight scalp — squeezes the vessels"), "A tight scalp, squeezes the vessels.");
  assert.equal(tidyLine('2. "Scalp exercises" help'), "Scalp exercises help.");
  assert.equal(tidyLine("3 scalp exercises can help"), "3 scalp exercises can help.");
});

test("beatProblem: no first person, no stories, no 'routine'", () => {
  assert.equal(beatProblem("For most people, the scalp on top is tighter."), null);
  assert.equal(beatProblem("I fixed my hair this way."), "first person");
  assert.equal(beatProblem("A guy online regrew his hair."), "story");
  assert.equal(beatProblem("My friend regrew his hair."), "first person");
  assert.equal(beatProblem("Do the routine every day."), "banned word");
});

test("cleanCta: only pinned-video endings without asks or result claims", () => {
  assert.equal(cleanCta("Go to my profile — the pinned video at the top"), "Go to my profile, the pinned video at the top.");
  assert.equal(cleanCta("Link in my bio"), "");
  assert.equal(cleanCta("Check my pinned video. You'll thank me later."), "");
  assert.equal(cleanCta("The pinned video shows how I fixed my hair loss."), "");
  assert.equal(cleanCta(""), "");
});

test("parseBeats: tidies and keeps 3-4 beats; throws when too few survive", () => {
  const r = parseBeats("```json\n" + GOOD + "\n```");
  assert.equal(r.beats.length, 4);
  assert.equal(r.beats[1], "A tight scalp squeezes the blood vessels, so blood can't reach the hair.");
  assert.equal(r.beats[3], "Scalp exercises every day can loosen it up.");
  assert.equal(r.cta, "Check my pinned video, it's the first one on my profile.");
  assert.throws(() => parseBeats(JSON.stringify({ beats: ["I fixed mine.", "My friend too.", "Scalp exercises help."] })), /usable beats/);
});

test("beatsFor: retries once when the first answer breaks a rule", async () => {
  const prompts: string[] = [];
  const answers = [JSON.stringify({ beats: ["I fixed my hair.", "Me too."], cta: "" }), GOOD];
  const r = await beatsFor({ hook_line: "Pinch the top of your scalp right now.", transcript: TRANSCRIPT }, async (_s, u) => {
    prompts.push(u);
    return answers.shift()!;
  });
  assert.equal(r.beats.length, 4);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /broke a rule/);
});

// ---------------------------------------------------------------- tiny Firestore fake

function fakeDb(docs: Record<string, Record<string, unknown>>) {
  const ref = (id: string) => ({
    id,
    get: async () => snap(id),
    update: async (patch: Record<string, unknown>) => {
      docs[id] = { ...docs[id], ...patch };
    },
  });
  const snap = (id: string) => ({ id, exists: id in docs, data: () => (id in docs ? { ...docs[id] } : undefined), ref: ref(id) });
  const col = {
    doc: ref,
    where: (_f: string, _o: string, v: unknown) => ({
      get: async () => ({ docs: Object.keys(docs).filter((id) => docs[id].status === v).map(snap) }),
    }),
  };
  const db = {
    collection: () => col,
    getAll: async (...refs: { id: string }[]) => refs.map((r) => snap(r.id)),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (r: { id: string }) => snap(r.id),
        update: (r: { id: string }, patch: Record<string, unknown>) => {
          docs[r.id] = { ...docs[r.id], ...patch };
        },
      }),
  };
  return db as unknown as Firestore;
}

test("generateProvenBeats: fills missing beats as auto, leaves edited ones, counts failures", async () => {
  const docs: Record<string, Record<string, unknown>> = {
    a: { status: "active", added_by: "seed", transcript: TRANSCRIPT, hook_line: "Pinch." },
    b: { status: "active", added_by: "seed", transcript: TRANSCRIPT, hook_line: "Pinch.", talking_points: ["Edited by hand."], talking_points_source: "admin" },
    c: { status: "active", added_by: "seed", transcript: TRANSCRIPT + " broken", hook_line: "Broken." },
    d: { status: "retired", added_by: "seed", transcript: TRANSCRIPT, hook_line: "Old." },
  };
  const db = fakeDb(docs);
  const dry = await generateProvenBeats({ db, dry: true, log: () => {} });
  assert.equal(dry.needing, 2);
  assert.deepEqual(dry.ids, ["a", "c"]);

  const r = await generateProvenBeats({
    db,
    log: () => {},
    now: () => new Date("2026-10-07T10:00:00Z"),
    generate: async (_s, u) => (u.includes("broken") ? "no json here" : GOOD),
  });
  assert.equal(r.generated, 1);
  assert.equal(r.with_cta, 1);
  assert.equal(r.failed.length, 1);
  assert.equal(docs.a.talking_points_source, "auto");
  assert.equal((docs.a.talking_points as string[]).length, 4);
  assert.equal(docs.a.cta_line, "Check my pinned video, it's the first one on my profile.");
  assert.deepEqual(docs.b.talking_points, ["Edited by hand."]);
  assert.equal((docs.c.beats as { attempts: number }).attempts, 1);
  assert.equal(docs.d.talking_points, undefined);
});
