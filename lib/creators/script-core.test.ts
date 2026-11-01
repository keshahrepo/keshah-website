import { test } from "node:test";
import assert from "node:assert/strict";
import { appBuild, linesForBuild, CORE_ENDING, CORE_NEW_HOOKS, CORE_PROVEN_HOOKS, chooseNewHooks as choose, coreBeats, coreLines as lines0, verdictWord } from "./script-core";

const HOOKS = new Map([...CORE_PROVEN_HOOKS, ...CORE_NEW_HOOKS].map((h) => [h.proven_id, h.text]));
const CORE_NEW_IDS = CORE_NEW_HOOKS.map((h) => h.proven_id);
const coreLines = (id: string, seed: string, slot = 0) => (HOOKS.has(id) ? lines0(HOOKS.get(id)!, id, seed, slot) : null);
const chooseNewHooks = (h: Record<string, string[]>, d: string) => choose(h, d, 2, CORE_NEW_IDS);
const ids = [...CORE_PROVEN_HOOKS.map((h) => h.proven_id), ...CORE_NEW_IDS];
const scripts = Array.from({ length: 400 }, (_, i) => coreLines(ids[i % ids.length], `c${Math.floor(i / 5)}|2026-11-02`, i % 5)!);

test("the hook text is the first line, as given", () => {
  assert.equal(lines0("My own hook. That could be the reason why you're losing hair.", "x", "s")[0].text, "My own hook. That could be the reason why you're losing hair.");
  assert.equal(choose({}, "2026-11-02", 2, []).length, 0);
});

test("same seed, same script (stable all day)", () => {
  assert.deepEqual(coreLines(ids[0], "c1|2026-11-02", 0), coreLines(ids[0], "c1|2026-11-02", 0));
});

test("every script runs hook → it's not → ... → fix → ending, with the fixed beats always in", () => {
  for (const s of scripts) {
    const labels = s.map((l) => l.label);
    assert.equal(labels[0], "Hook");
    assert.equal(labels[1], "It's not");
    assert.deepEqual(labels.slice(-4), ["Chain", "Products", "The fix", "Ending"]);
    assert.ok(labels.includes("Science"));
    assert.equal(s.at(-1)!.text, CORE_ENDING);
    // Science comes before "Have you noticed", which comes before the chain.
    const n = labels.indexOf("Have you noticed");
    if (n >= 0) assert.ok(labels.indexOf("Science") < n && n < labels.indexOf("Chain"));
  }
});

test("the 2.6x line only runs with 'Have you noticed' (never right before the chain)", () => {
  for (const s of scripts) {
    const sci = s.find((l) => l.label === "Science")!.text;
    if (sci.includes("2.6")) assert.ok(coreBeats(s).noticed);
  }
  assert.ok(scripts.some((s) => s.find((l) => l.label === "Science")!.text.includes("2.6")), "2.6x still used");
});

test("products line never repeats slot 2", () => {
  const pairs: [RegExp, RegExp][] = [[/rosemary oil/, /magical oils/], [/taking minoxidil/, /best minoxidil/], [/more pills/, /stuffing pills/]];
  for (const s of scripts) {
    const not = s[1].text;
    const prod = s.find((l) => l.label === "Products")!.text;
    for (const [a, b] of pairs) assert.ok(!(a.test(not) && b.test(prod)), `${not} / ${prod}`);
  }
});

test("it's not = one cause, one thing people take, one absurd, with the tone note", () => {
  for (const s of scripts) {
    assert.equal((s[1].text.match(/It's not/g) ?? []).length, 3);
    assert.match(s[1].tone ?? "", /fed up, almost mocking/);
  }
});

test("new hooks: two a day, least recently given first, never repeated within the day", () => {
  const first = chooseNewHooks({}, "2026-11-02");
  assert.equal(first.length, 2);
  assert.notEqual(first[0], first[1]);
  const history: Record<string, string[]> = Object.fromEntries(CORE_NEW_IDS.map((id) => [id, ["2026-10-30"]]));
  history[CORE_NEW_IDS[4]] = [];
  assert.equal(chooseNewHooks(history, "2026-11-02")[0], CORE_NEW_IDS[4]);
  // Over a week every hook comes round before any repeats.
  const h: Record<string, string[]> = {};
  const seen: string[] = [];
  for (const d of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]) {
    for (const id of chooseNewHooks(h, d)) {
      seen.push(id);
      (h[id] ??= []).push(d);
    }
  }
  assert.equal(new Set(seen).size, seen.length);
});

test("a day's 5 videos don't repeat the absurd line or the slot 2 line", () => {
  for (let d = 0; d < 50; d++) {
    const day = Array.from({ length: 5 }, (_, slot) => coreLines(ids[slot], `c${d}|2026-11-02`, slot)!);
    const absurd = day.map((s) => s[1].text.split(". ").at(-1));
    assert.equal(new Set(absurd).size, 5, absurd.join(" / "));
    const take = day.map((s) => s[1].text.split(". ")[1]);
    assert.equal(new Set(take).size, 5, take.join(" / "));
  }
});

test("noticed: 2 or 3 of the day's 5 videos, alternating; every video has a source, all different within the day", () => {
  for (let d = 0; d < 200; d++) {
    const day = Array.from({ length: 5 }, (_, slot) => coreLines(ids[slot], `c${d}|2026-11-02`, slot)!);
    const src = day.map((s) => s.find((l) => l.label === "Where I found it")!.text);
    assert.equal(new Set(src).size, 5, src.join(" / "));
    for (const label of ["Have you noticed"]) {
      const got = day.map((s) => s.find((l) => l.label === label)?.text.split(". ")[0]).filter((x): x is string => !!x);
      assert.ok(got.length === 2 || got.length === 3, `${label}: ${got.length}`);
      for (let i = 1; i < got.length; i++) assert.notEqual(got[i], got[i - 1], `${label} repeats: ${got.join(" / ")}`);
    }
  }
});

test("the fix's dare rotates, never echoes the products line, never a second god joke", () => {
  const seen = new Set<string>();
  for (const s of scripts) {
    const fix = s.find((l) => l.label === "The fix")!;
    const keep = /keep ([^.]+)\./.exec(fix.text)![1];
    seen.add(keep);
    assert.equal(fix.tone, `Say "keep ${keep}" mocking.`);
    const prod = s.find((l) => l.label === "Products")!.text;
    if (/oils/.test(prod)) assert.notEqual(keep, "applying your oils");
    if (/pills/.test(prod)) assert.notEqual(keep, "taking your pills");
    if (/god/.test(s[1].text)) assert.notEqual(keep, "hoping for god to save you");
  }
  assert.equal(seen.size, 5);
});

test("old apps get the tone note inside hands; build 25+ gets them apart", () => {
  assert.equal(appBuild("1.0.0+24"), 24);
  assert.equal(appBuild(null), null);
  const l = [{ text: "x", hands: "Show it.", tone: "Say it mocking." }, { text: "y", tone: "Fed up." }];
  assert.deepEqual(linesForBuild(l, 24), [{ text: "x", hands: "Show it. Say it mocking." }, { text: "y", hands: "Fed up." }]);
  assert.deepEqual(linesForBuild(l, null)[1], { text: "y", hands: "Fed up." });
  assert.equal(linesForBuild(l, 25), l);
});

test("reason bridge: the first not-line opens with the reason, still three nots; avoid words never show up", () => {
  for (let slot = 0; slot < 5; slot++) {
    const s = lines0("Guys, stop and listen.", "x", `d${slot}|2026-11-02`, slot, { bridge: "reason", avoid: ["minoxidil", "finasteride"] });
    assert.match(s[1].text, /^The reason you're losing hair is not your (genetics|age|hormones)\./);
    assert.equal(s[1].text.split(/(?<=\.) /).length, 3, s[1].text);
    const body = s.map((l) => l.text).join(" ").toLowerCase();
    assert.ok(!/minoxidil|finasteride/.test(body), body);
  }
});

test("Japanese sources only with 'Have you noticed', always followed by the 2.6x line", () => {
  let seen = 0;
  for (const s of scripts) {
    const src = s.find((l) => l.label === "Where I found it")!.text;
    const sci = s.find((l) => l.label === "Science")!.text;
    assert.ok(s.indexOf(s.find((l) => l.label === "Where I found it")!) === 2, "source right after the not-list");
    if (/Japanese/.test(src)) {
      seen++;
      assert.ok(coreBeats(s).noticed);
      assert.match(sci, /2\.6/);
    }
  }
  assert.ok(seen > 0);
});
