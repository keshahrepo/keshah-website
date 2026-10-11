import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceTimezoneUpdate } from "./app-seen";

test("device timezone: fills an unset or default zone, never overrides calendly / founder / device", () => {
  const la = "America/Los_Angeles";
  assert.deepEqual(deviceTimezoneUpdate({}, la), { timezone: la, timezone_source: "device" });
  assert.deepEqual(deviceTimezoneUpdate({ timezone: "America/New_York" }, la), { timezone: la, timezone_source: "device" });
  assert.equal(deviceTimezoneUpdate({ timezone: "America/Chicago" }, la), null);
  assert.equal(deviceTimezoneUpdate({ timezone: "America/New_York", timezone_source: "founder" }, la), null);
  assert.equal(deviceTimezoneUpdate({ timezone: "America/New_York", timezone_source: "calendly" }, la), null);
  assert.equal(deviceTimezoneUpdate({ timezone: "America/New_York", timezone_source: "device" }, la), null);
  assert.equal(deviceTimezoneUpdate({}, null), null);
  assert.equal(deviceTimezoneUpdate({}, "PDT"), null);
  assert.equal(deviceTimezoneUpdate({}, "Not/AZone"), null);
});
