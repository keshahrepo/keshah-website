import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketDay, parseDailyBySegment } from "./installs-daily";

test("parses RevenueCat daily segments and buckets Aadi / creators / organic", () => {
  const o = {
    segments: [{ display_name: "Aadi TikTok" }, { display_name: "isai" }, { display_name: "(none)" }],
    values: [
      { cohort: Date.parse("2026-10-20T00:00:00Z") / 1000, measure: 0, segment: 0, value: 100 },
      { cohort: Date.parse("2026-10-20T00:00:00Z") / 1000, measure: 0, segment: 1, value: 60 },
      { cohort: Date.parse("2026-10-20T00:00:00Z") / 1000, measure: 0, segment: 2, value: 540 },
      { cohort: Date.parse("2026-10-20T00:00:00Z") / 1000, measure: 1, segment: 2, value: 9999 },
    ],
  };
  const m = parseDailyBySegment(o);
  const b = bucketDay(m.get("2026-10-20")!, new Set(["Aadi", "Aadi TikTok"]), new Set(["isai"]));
  assert.deepEqual(b, { installs: 700, aadi: 100, creators: 60, organic: 540 });
});
