// Run: npx tsx --test lib/creators/content.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WEEK_MIX,
  changedFields,
  editPatch,
  ideaInputFromScript,
  parseScripts,
  scriptCta,
  scriptProblems,
  toScript,
  weekOfFor,
  weekStateOf,
  type ContentScript,
  type RawScript,
} from "./content";
import { CONTENT_FACTS, factById } from "./content-facts";
import { CONTENT_SYSTEM, draftSlots, slotGroups, sourceBrief, toContentScript, type WriterContext } from "./content-writer";

export const SAMPLE: RawScript = {
  title: "Eyebrow raise",
  format: "self-test",
  hook_family: "eyebrow raise test",
  first_frame: "Raising your eyebrows hard, fingertips resting on your hairline.",
  on_screen_text: "if ur hairline doesn't move, this is why ur balding",
  hook: "Raise your eyebrows as high as you can right now. Did your hairline move with them? If it didn't, your scalp is stuck.",
  points: [
    "That's usually not your genetics or your shampoo.",
    "A stuck scalp is a tight scalp. It squeezes the blood vessels underneath, so blood can't reach your hair, and over time it falls out.",
    "And here's the crazy part. Your forehead muscle pulls on the same tough sheet that covers the top of your head. That's why a loose scalp moves when you raise your eyebrows.",
  ],
  cta_1: "I go through how to check it properly and how to fix it in my pinned video, the one that says watch this first. It's literally the first video on my profile, so please don't DM me saying you can't find it.",
  beat: "It also shows you the mistake most people make when they try to loosen it.",
  cta_2: "So if yours didn't move just now, at least you know why. What do you have to lose?",
  fact_id: "F13_galea_layers_anatomy",
};

const variant = (i: number): RawScript => ({ ...SAMPLE, beat: `${SAMPLE.beat} Part ${i}.`, cta_2: `${SAMPLE.cta_2} Number ${i}.` });

test("facts module: 16 verified facts, unique ids, every field filled", () => {
  assert.equal(CONTENT_FACTS.length, 16);
  assert.equal(new Set(CONTENT_FACTS.map((f) => f.id)).size, 16);
  for (const f of CONTENT_FACTS) assert.ok(f.line && f.never && f.source, f.id);
  assert.equal(factById("F02_lower_blood_flow_balding")?.source.includes("1989"), true);
  assert.equal(factById("nope"), null);
});

test("week mix: 7 self-tests, 2 new angles, 1 adapted in 10 slots", () => {
  assert.equal(WEEK_MIX.length, 10);
  const count = (s: string) => WEEK_MIX.filter((x) => x === s).length;
  assert.deepEqual([count("adapted"), count("new-self-test"), count("new-angle"), count("revival")], [1, 7, 2, 0]);
  assert.deepEqual(slotGroups().map((g) => [g.source, g.slots]), [
    ["new-self-test", [1, 2, 3, 4, 5, 6, 7]],
    ["new-angle", [8, 9]],
    ["adapted", [10]],
  ]);
});

test("validation: the sample passes; em dash, missing field, bad fact, banned asks and uppercase text fail", () => {
  assert.deepEqual(scriptProblems(SAMPLE), []);
  assert.ok(scriptProblems({ ...SAMPLE, hook: "Raise your eyebrows — now." }).some((p) => p.includes("dash")));
  assert.ok(scriptProblems({ ...SAMPLE, cta_2: "" }).some((p) => p.includes("missing cta_2")));
  assert.ok(scriptProblems({ ...SAMPLE, fact_id: "F99" }).some((p) => p.includes("unknown fact")));
  assert.ok(scriptProblems({ ...SAMPLE, cta_2: "Link in bio, follow me." }).some((p) => p.includes("banned")));
  assert.ok(scriptProblems({ ...SAMPLE, cta_2: "I fixed my hair this way." }).some((p) => p.includes("banned")));
  assert.ok(scriptProblems({ ...SAMPLE, on_screen_text: "If UR hairline" }).some((p) => p.includes("lowercase")));
  assert.ok(scriptProblems({ ...SAMPLE, points: ["a", "b"] }).some((p) => p.includes("exactly 3")));
  assert.ok(scriptProblems({ ...SAMPLE, format: "vlog" }).some((p) => p.includes("format")));
  assert.ok(scriptProblems({ ...SAMPLE, cta_1: "Check my profile." }).some((p) => p.includes("pinned")));
});

test("parseScripts: count, JSON string, duplicate cta_2 / beat", () => {
  const ok = parseScripts(JSON.stringify({ scripts: [variant(1), variant(2)] }), [4, 5]);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.scripts.map((s) => s.slot), [4, 5]);
  const asString = parseScripts({ scripts: JSON.stringify([variant(1)]) }, [1]);
  assert.equal(asString.ok, true);
  assert.equal(parseScripts({ scripts: [variant(1)] }, [1, 2]).ok, false);
  const dup = parseScripts({ scripts: [SAMPLE, SAMPLE] }, [1, 2]);
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.ok(dup.problems.some((p) => p.includes("cta_2")));
  assert.equal(parseScripts("no json here", [1]).ok, false);
});

const ctx: WriterContext = {
  week_of: "2026-10-19",
  library: "",
  strong_families: [{ family: "does your scalp move", format: "self-test", median_views: 500000, recent: 0, example_hook: "Does your scalp move?" }],
  revival_formats: ["authority-story", "myth-bust"],
  learnings: "",
  scan: [{ url: "https://www.tiktok.com/@drrodpt/video/1", handle: "drrodpt", platform: "tiktok", niche: "posture", views: 52600000, caption: "posture test" }],
  bank_tests: [],
};

test("draftSlots: retries once with the problems, then succeeds", async () => {
  const calls: string[] = [];
  const gen = async (_s: string, user: string) => {
    calls.push(user);
    return JSON.stringify({ scripts: [calls.length === 1 ? { ...SAMPLE, hook: "Do this — now." } : SAMPLE] });
  };
  const out = await draftSlots("new-self-test", [4], ctx, gen);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes("broke these rules") && calls[1].includes("dash"));
  assert.equal(out[0].slot, 4);
  assert.equal(out[0].reference, null);
});

test("draftSlots: gives up after the retry", async () => {
  const gen = async () => JSON.stringify({ scripts: [{ ...SAMPLE, cta_2: "" }] });
  await assert.rejects(draftSlots("revival", [9], ctx, gen), /missing cta_2/);
});

test("draftSlots: adapted scripts must name a listed video, which becomes the reference", async () => {
  let n = 0;
  const gen = async () => JSON.stringify({ scripts: [{ ...SAMPLE, reference_url: n++ ? "https://www.tiktok.com/@drrodpt/video/1" : "https://example.com/x" }] });
  const [d] = await draftSlots("adapted", [1], ctx, gen);
  assert.deepEqual(d.reference, { url: "https://www.tiktok.com/@drrodpt/video/1", handle: "drrodpt", views: 52600000, platform: "tiktok" });
});

test("system prompt carries the writing rules", () => {
  for (const s of ["my pinned video, the one that says watch this first", "please don't DM me saying you can't find it", "no em dashes ever", "this guy", "30-45 seconds read aloud", "Vary cta_2 angles"]) {
    assert.ok(CONTENT_SYSTEM.includes(s), s);
  }
});

function script(over: Partial<ContentScript> = {}): ContentScript {
  const r = parseScripts({ scripts: [SAMPLE] }, [3]);
  if (!r.ok) throw new Error(r.problems.join("; "));
  const d = { ...r.scripts[0], reference: null };
  return { ...toContentScript(d, "2026-10-19", "new-self-test", "2026-10-17T20:00:00.000Z"), id: "s3", ...over };
}

test("toContentScript: fact expanded from the library, draft with a drafted history", () => {
  const s = script();
  assert.equal(s.status, "draft");
  assert.deepEqual(s.fact, { id: "F13_galea_layers_anatomy", line: factById("F13_galea_layers_anatomy")!.line, source: factById("F13_galea_layers_anatomy")!.source });
  assert.deepEqual(s.history.map((h) => h.kind), ["drafted"]);
  assert.equal(s.slot, 3);
});

test("approve -> idea fields: hook_full = hook, points, cta = cta_1 + beat + cta_2, first frame, on-screen text, photo, slot-ordered id", () => {
  const s = script({ photo: { point: 2, url: "https://x/y.jpg", caption: "Scalp" }, reference: { url: "https://www.tiktok.com/@a/video/1", handle: "a", views: 1, platform: "tiktok" } });
  const i = ideaInputFromScript(s);
  assert.equal(i.hook_line, s.hook);
  assert.equal(i.script.hook_full, s.hook);
  assert.deepEqual(i.talking_points, s.points);
  assert.equal(i.script.cta_line, `${s.cta_1}\n\n${s.beat}\n\n${s.cta_2}`);
  assert.equal(i.script.cta_line, scriptCta(s));
  assert.equal(i.script.first_frame, s.first_frame);
  assert.equal(i.script.on_screen_text, s.on_screen_text);
  assert.deepEqual(i.script.photo, s.photo);
  assert.equal(i.script.format, "self-test");
  assert.equal(i.script.content_script_id, "s3");
  assert.equal(i.reference_url, "https://www.tiktok.com/@a/video/1");
  assert.equal(i.id_prefix, "c20261019s03");
  assert.ok(ideaInputFromScript(script({ slot: 10 })).id_prefix > i.id_prefix);
  assert.equal("photo" in ideaInputFromScript(script()).script, false);
});

test("edit patch: cleans fields, rejects dashes and bad facts; changedFields lists what moved", () => {
  const p = editPatch({ hook: " New  hook. ", on_screen_text: "LOUD", status: "approved", fact: { id: "F02_lower_blood_flow_balding" } });
  assert.equal(p.hook, "New hook.");
  assert.equal(p.on_screen_text, "loud");
  assert.equal("status" in p, false);
  assert.equal(p.fact?.id, "F02_lower_blood_flow_balding");
  assert.throws(() => editPatch({ beat: "a — b" }));
  assert.throws(() => editPatch({ fact: { id: "x" } }));
  assert.throws(() => editPatch({ points: ["a"] }));
  const s = script();
  assert.deepEqual(changedFields(s, { ...s, ...p }), ["on_screen_text", "hook", "fact"]);
});

test("weekOfFor: a Monday stays, other days go to the next Monday", () => {
  assert.equal(weekOfFor("2026-10-19"), "2026-10-19");
  assert.equal(weekOfFor("2026-10-17"), "2026-10-19"); // Saturday
  assert.equal(weekOfFor("2026-10-18"), "2026-10-19"); // Sunday
  assert.equal(weekOfFor("2026-10-20"), "2026-10-26");
});

test("week state from scripts", () => {
  assert.equal(weekStateOf(undefined, []), "none");
  assert.equal(weekStateOf("drafting", []), "drafting");
  assert.equal(weekStateOf("ready", [{ status: "draft" }, { status: "approved" }]), "ready");
  assert.equal(weekStateOf("ready", [{ status: "approved" }, { status: "rejected" }]), "approved");
});

test("toScript fills defaults for partial docs", () => {
  const s = toScript("x", { week_of: "2026-10-19", points: ["a"] });
  assert.equal(s.status, "draft");
  assert.deepEqual(s.points, ["a", "", ""]);
  assert.equal(s.fact, null);
  assert.deepEqual(s.history, []);
});

test("creator picks expose first_frame, on_screen_text and photo only when the idea doc has them", async () => {
  const { publicProven, toProven } = await import("./proven-db");
  const base = { hook_line: "Raise your eyebrows", status: "active", added_by: "founder_idea", views: 0 };
  const withScript = publicProven("i1", toProven({ ...base, first_frame: "Hands on forehead", on_screen_text: "try this test", photo: { point: 2, url: "https://x/y.jpg", caption: "Scalp" } }));
  assert.equal(withScript.first_frame, "Hands on forehead");
  assert.equal(withScript.on_screen_text, "try this test");
  assert.deepEqual(withScript.photo, { point: 2, url: "https://x/y.jpg", caption: "Scalp" });
  const plain = publicProven("i2", toProven(base));
  assert.equal("first_frame" in plain || "on_screen_text" in plain || "photo" in plain, false);
});

test("new self-test brief lists the bank tests in order when there are some", () => {
  const b = sourceBrief("new-self-test", { ...ctx, bank_tests: [{ id: "tent_test", area: "scalp", test: "Pinch the top and lift it.", fail: "it barely lifts" }] });
  assert.ok(b.includes("1. [scalp] Pinch the top and lift it. Fail: it barely lifts."));
  assert.ok(!sourceBrief("new-self-test", ctx).includes("IN THIS ORDER"));
});
