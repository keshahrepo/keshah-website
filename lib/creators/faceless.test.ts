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
