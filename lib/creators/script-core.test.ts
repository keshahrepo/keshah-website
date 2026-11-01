import { test } from "node:test";
import assert from "node:assert/strict";
import { CORE_ENDING, CORE_NEW_IDS, CORE_PROVEN_HOOKS, chooseNewHooks, coreBeats, coreLines, verdictWord } from "./script-core";

const ids = [...CORE_PROVEN_HOOKS.map((h) => h.proven_id), ...CORE_NEW_IDS];
const scripts = Array.from({ length: 400 }, (_, i) => coreLines(ids[i % ids.length], `c1|2026-11-0${(i % 5) + 2}|${i}`)!);

test("unknown video keeps its normal script", () => {
  assert.equal(coreLines("tiktok_not_core", "s"), null);
});

test("same seed, same script (stable all day)", () => {
  assert.deepEqual(coreLines(ids[0], "c1|2026-11-02|0"), coreLines(ids[0], "c1|2026-11-02|0"));
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

test("why + noticed each show up in about half the videos, independently", () => {
  const why = scripts.filter((s) => coreBeats(s).why).length / scripts.length;
  const noticed = scripts.filter((s) => coreBeats(s).noticed).length / scripts.length;
  assert.ok(why > 0.38 && why < 0.62, `why ${why}`);
  assert.ok(noticed > 0.38 && noticed < 0.62, `noticed ${noticed}`);
  const both = scripts.filter((s) => coreBeats(s).why && coreBeats(s).noticed).length / scripts.length;
  assert.ok(both > 0.15 && both < 0.35, `both ${both}`);
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

test("rabbit hole line takes the verdict's word", () => {
  assert.equal(verdictWord("That's probably why you're balding."), "balding");
  assert.equal(verdictWord("that could be the reason you're losing hair."), "losing hair");
  for (const s of scripts) {
    const why = s.find((l) => l.label === "Why I make these");
    if (!why) continue;
    assert.ok(why.text.endsWith(`this is why you're ACTUALLY ${verdictWord(s[0].text)}.`));
  }
});

test("it's not = one cause, one thing people take, one absurd, with the tone note", () => {
  for (const s of scripts) {
    assert.equal((s[1].text.match(/It's not/g) ?? []).length, 3);
    assert.match(s[1].hands ?? "", /fed up, almost mocking/);
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
