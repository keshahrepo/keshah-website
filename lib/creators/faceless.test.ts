import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSpec, pickSources, type FacelessSource, type FacelessSpec } from "./faceless";

const T = "word ".repeat(60);
const src = (id: string, views: number, format: string, fam: string): FacelessSource => ({ id, views, format, hook_family: fam, transcript: T });

test("pickSources: strongest first, one per family, capped self-tests, skips used and wrong formats", () => {
  const all = [src("a", 9, "self-test", "pinch"), src("b", 8, "self-test", "pinch"), src("c", 7, "explainer", "draw"), src("d", 6, "self-test", "move"), src("e", 5, "self-test", "neck"), src("f", 4, "personal-story", "story"), src("g", 3, "myth-bust", "minox")];
  const p = pickSources(all, new Set(["c"]), 5, 2).map((x) => x.id);
  assert.deepEqual(p, ["a", "d", "g"]);
});

const good: FacelessSpec = {
  title: "The pinch test",
  caseName: "THE PINCH TEST",
  caption: "Pinch the top of your head. #hairloss #scalphealth",
  script:
    "Take two fingers and a thumb and pinch the side of your head. Now pinch the top. If the top is stuck, that could be why you're losing hair. It's not your genetics. It's not your shampoo. A tight scalp squeezes the blood vessels underneath, so blood can't properly reach the hair. One small study found men starting to go bald had about two and a half times less blood flow in their scalp. Less blood means thinner hair over time. The sides stay loose, so they keep their hair. Specific techniques can loosen it. Pressing, pinching, sliding. How to loosen it is in the pinned video.",
  scenes: [
    { type: "pinch", cue: "", lift: 1, label: "SIDE · LIFTS", tone: "loose" },
    { type: "pinch", cue: "Now pinch the top", lift: 0.1, label: "TOP · STUCK", tone: "tight" },
    { type: "head", cue: "If the top" },
    { type: "cards", cue: "It's not your genetics", items: [{ title: "GENETICS" }] },
    { type: "section", cue: "A tight scalp", squeeze: true },
    { type: "study", cue: "One small study", fact: "F02" },
    { type: "tags", cue: "Pressing, pinching, sliding", items: [{ text: "PRESSING" }] },
    { type: "end", cue: "How to loosen" },
  ],
};

test("checkSpec passes a good spec and catches the usual problems", () => {
  assert.deepEqual(checkSpec(good), []);
  assert.ok(checkSpec({ ...good, script: good.script + " I fixed my hair." }).some((p) => p.includes("first person")));
  assert.ok(checkSpec({ ...good, script: good.script.replace("It's not your genetics.", "It's not — your genetics.") }).some((p) => p.includes("dash")));
  assert.ok(checkSpec({ ...good, scenes: [...good.scenes.slice(0, 7), { type: "end", cue: "Nope not here" }] }).some((p) => p.includes("cue not in script")));
  assert.ok(checkSpec({ ...good, scenes: good.scenes.slice(0, 7) }).some((p) => p.includes("last scene")));
});

test("dayTargets: 10 a day is 6 bank tests, 2 proven self-tests, 2 other formats", async () => {
  const { dayTargets } = await import("./faceless");
  assert.deepEqual(dayTargets(10), { bank: 6, proven: 2, other: 2 });
});

test("pickDay: bank tests first and varied, proven baseline, other formats, plus spares", async () => {
  const { pickDay, bankSources } = await import("./faceless");
  const long = "word ".repeat(60);
  const proven: FacelessSource[] = [
    { id: "p1", views: 900, format: "self-test", hook_family: "pinch", transcript: long },
    { id: "p2", views: 800, format: "self-test", hook_family: "pinch", transcript: long },
    { id: "p3", views: 700, format: "self-test", hook_family: "slide", transcript: long },
    { id: "p4", views: 600, format: "self-test", hook_family: "move", transcript: long },
    { id: "o1", views: 500, format: "explainer", hook_family: "draw", transcript: long },
    { id: "o2", views: 400, format: "myth-bust", hook_family: "myth", transcript: long },
    { id: "o3", views: 300, format: "list", hook_family: "list", transcript: long },
  ];
  const all = bankSources();
  const tried = new Map([[all[0].id, 3]]); // tried 3 times already: skipped
  const picks = pickDay({ proven, usedIds: new Set(), bankUses: tried, todayIds: new Set([all[1].id]), todayFams: new Set(), yesterdayFams: new Set([all[2].hook_family]), need: { bank: 6, proven: 2, other: 2 } });
  const bank = picks.filter((p) => p.bank);
  assert.equal(bank.length, 7);
  assert.ok(!bank.some((p) => p.id === all[0].id || p.id === all[1].id || p.id === all[2].id));
  assert.deepEqual(picks.filter((p) => !p.bank && p.format === "self-test").map((p) => p.id), ["p1", "p3", "p4"]);
  assert.deepEqual(picks.filter((p) => p.format !== "self-test").map((p) => p.id), ["o1", "o2", "o3"]);
});

test("checkSpec: main_fact must be a library id or none", () => {
  assert.deepEqual(checkSpec({ ...good, main_fact: "F02" }), []);
  assert.deepEqual(checkSpec({ ...good, main_fact: "none" }), []);
  assert.ok(checkSpec({ ...good, main_fact: "F99_made_up" }).some((p) => p.includes("main_fact")));
});
