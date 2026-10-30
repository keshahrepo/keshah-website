import { test } from "node:test";
import assert from "node:assert/strict";
import { calibration, parsePrediction, trialResult } from "./predictions";

test("parsePrediction: only the five levels, short why", () => {
  assert.deepEqual(parsePrediction({ pct: 80, why: "  great on camera " }, "t"), { pct: 80, why: "great on camera", at: "t" });
  assert.ok("error" in parsePrediction({ pct: 50 }, "t"));
});

test("trialResult and calibration", () => {
  assert.equal(trialResult({ trial_outcome: "keep" }), "passed");
  assert.equal(trialResult({ start_date: "2026-10-01", status: "ended" }), "not_passed");
  assert.equal(trialResult({ start_date: "2026-10-01", status: "trial" }), "in_trial");
  assert.equal(trialResult({}), "not_started");
  const c = calibration([{ pct: 80, result: "passed" }, { pct: 80, result: "not_passed" }, { pct: 80, result: "in_trial" }]);
  assert.deepEqual(c.find((x) => x.pct === 80), { pct: 80, decided: 2, passed: 1, waiting: 1 });
});
