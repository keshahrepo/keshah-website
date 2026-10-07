// Run: npx tsx --test lib/creators/proven-beats.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";
import { BEATS_MAX_ATTEMPTS, beatProblem, beatsFor, cleanCta, cleanHeader, cleanHook, parseTitleLines, retitleFormats, cleanTitle, generateProvenBeats, needsBeats, parseBeats, tidyLine } from "./proven-beats";

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
  title: "Tight scalp check.",
});

test("needsBeats: active proven videos with a transcript and no points, under the attempt cap", () => {
  const base = { status: "active" as const, added_by: "seed" as const, transcript: TRANSCRIPT };
  assert.equal(needsBeats(base), true);
  assert.equal(needsBeats({ ...base, talking_points: ["x"], short_title: "Pinch test", hook_full: "If you are losing hair, pinch here.", hook_first_person: false, header_text: "Losing hair? Try this test" }), false);
  assert.equal(needsBeats({ ...base, talking_points: ["x"], short_title: "Pinch test" }), true);
  // Points written by hand but no list title yet: still needs the title.
  assert.equal(needsBeats({ ...base, talking_points: ["x"] }), true);
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

test("cleanTitle: 2-4 words, no punctuation, no first person or 'routine'", () => {
  assert.equal(cleanTitle("Tight scalp check."), "Tight scalp check");
  assert.equal(cleanTitle("minoxidil truth"), "Minoxidil truth");
  assert.equal(cleanTitle("Pinch"), "");
  assert.equal(cleanTitle("How I fixed it"), "");
  assert.equal(cleanTitle("Daily routine tip"), "");
  assert.equal(cleanTitle("This is far too long a title"), "");
});

test("parseBeats: tidies and keeps 3-4 beats; throws when too few survive", () => {
  const r = parseBeats("```json\n" + GOOD + "\n```");
  assert.equal(r.beats.length, 4);
  assert.equal(r.beats[1], "A tight scalp squeezes the blood vessels, so blood can't reach the hair.");
  assert.equal(r.beats[3], "Scalp exercises every day can loosen it up.");
  assert.equal(r.cta, "Check my pinned video, it's the first one on my profile.");
  assert.equal(r.title, "Tight scalp check");
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
  assert.equal(dry.needing, 3);
  assert.deepEqual(dry.ids, ["a", "b", "c"]);

  const r = await generateProvenBeats({
    db,
    log: () => {},
    now: () => new Date("2026-10-07T10:00:00Z"),
    generate: async (_s, u) => (u.includes("broken") ? "no json here" : GOOD),
  });
  assert.equal(r.generated, 2);
  assert.equal(r.with_cta, 1);
  assert.equal(r.failed.length, 1);
  assert.equal(docs.a.talking_points_source, "auto");
  assert.equal((docs.a.talking_points as string[]).length, 4);
  assert.equal(docs.a.cta_line, "Check my pinned video, it's the first one on my profile.");
  assert.equal(docs.a.short_title, "Tight scalp check");
  // Hand-edited points stay; only the missing title is added.
  assert.deepEqual(docs.b.talking_points, ["Edited by hand."]);
  assert.equal(docs.b.short_title, "Tight scalp check");
  assert.equal((docs.c.beats as { attempts: number }).attempts, 1);
  assert.equal(docs.d.talking_points, undefined);
});

test("cleanHook keeps the full hook only when it starts the transcript", () => {
  const tr = "If you're losing hair. You would have never heard this before. Take two fingers. Try to pinch the areas of your scalp.";
  assert.equal(cleanHook("If you're losing hair. You would have never heard this before. Take two fingers.", tr), "If you're losing hair. You would have never heard this before. Take two fingers.");
  assert.equal(cleanHook("Pinch your scalp right now, it will shock you.", tr), "");
  assert.equal(cleanHook("If", tr), "");
});

test("parseBeats reads hook and hook_first_person", () => {
  const tr = "I fixed my own hair loss four years ago without any drugs. So I made an app.";
  const r = parseBeats(
    JSON.stringify({ hook: "I fixed my own hair loss four years ago without any drugs.", hook_first_person: true, title: "Drug free fix", beats: ["For most people the scalp on top is tight.", "A tight scalp squeezes the blood vessels.", "Scalp exercises can loosen it up."], cta: "" }),
    tr,
  );
  assert.equal(r.hook_first_person, true);
  assert.equal(r.hook, "I fixed my own hair loss four years ago without any drugs.");
});

test("retitleFormats: one name per format, duplicates dropped, written to every version", async () => {
  const docs: Record<string, Record<string, unknown>> = {
    a: { status: "active", views: 900, hook_full: "Pinch the top of your scalp right now. Now pinch the sides. Feel the difference?" },
    b: { status: "active", views: 100, hook_full: "Pinch the top of your scalp right now. Now pinch the sides. Feel the difference? Top is tight." },
    c: { status: "active", views: 50, hook_full: "Are you using minoxidil? I just found out something crazy about it." },
  };
  const writes: Record<string, unknown> = {};
  const db = {
    collection: () => ({
      where: () => ({ get: async () => ({ docs: Object.entries(docs).map(([id, d]) => ({ id, data: () => d })) }) }),
      doc: (id: string) => id,
    }),
    batch: () => ({ update: (id: string, p: { short_title: string }) => (writes[id] = p.short_title), commit: async () => undefined }),
  } as unknown as Firestore;
  const r = await retitleFormats({ db, generate: async () => ({ titles: [{ id: "a", title: "Pinch top vs sides" }, { id: "c", title: "Pinch top vs sides" }] }) });
  assert.equal(r.formats, 2);
  assert.deepEqual(writes, { a: "Pinch top vs sides", b: "Pinch top vs sides" });
});

test("parseTitleLines reads id | name lines", () => {
  assert.deepEqual(parseTitleLines("tiktok_1 | Pinch top vs sides\n- instagram_DdZ: Scalp won't move\nnoise"), {
    titles: [
      { id: "tiktok_1", title: "Pinch top vs sides" },
      { id: "instagram_DdZ", title: "Scalp won't move" },
    ],
  });
});

test("cleanHeader: 3-9 words, no first person", () => {
  assert.equal(cleanHeader("If you're losing hair, try this."), "If you're losing hair, try this");
  assert.equal(cleanHeader("Pinch"), "");
  assert.equal(cleanHeader("Using minoxidil? Watch this before you put it on again tonight"), "Using minoxidil? Watch this before you put it on again tonight");
  assert.equal(cleanHeader("I fixed my hair with this one trick"), "");
});
