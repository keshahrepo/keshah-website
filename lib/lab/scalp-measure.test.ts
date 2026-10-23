import { test } from "node:test";
import assert from "node:assert/strict";
import { faceFrame, fromFace, headAngles, LM, nccMatch, patch, repTravel, summarize, toFace, upPx, type Gray, type Pt, type Sample } from "./scalp-measure";

// Smooth random texture, like skin under a camera.
function texture(w: number, h: number, ox = 0, oy = 0): Gray {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const X = x - ox;
      const Y = y - oy;
      data[y * w + x] = 128 + 40 * Math.sin(X * 0.31 + Y * 0.07) + 30 * Math.cos(Y * 0.23 - X * 0.11) + 20 * Math.sin((X + Y) * 0.53);
    }
  return { data, w, h };
}

test("nccMatch finds a whole-pixel shift", () => {
  const a = texture(120, 120);
  const tpl = patch(a, 60, 60, 10)!;
  const b = texture(120, 120, 4, -3); // content moved right 4, up 3
  const m = nccMatch(b, tpl, 60, 60, 8)!;
  assert.ok(Math.abs(m.x - 64) < 0.2, `x ${m.x}`);
  assert.ok(Math.abs(m.y - 57) < 0.2, `y ${m.y}`);
  assert.ok(m.score > 0.99);
});

test("nccMatch gets sub-pixel shifts to within a few tenths", () => {
  const a = texture(120, 120);
  const tpl = patch(a, 60, 60, 10)!;
  const b = texture(120, 120, 0, 1.5);
  const m = nccMatch(b, tpl, 60, 60, 6)!;
  assert.ok(Math.abs(m.y - 61.5) < 0.3, `y ${m.y}`);
});

test("nccMatch ignores brightness changes", () => {
  const a = texture(80, 80);
  const tpl = patch(a, 40, 40, 8)!;
  const b: Gray = { ...a, data: a.data.map((v) => v * 0.6 + 30) };
  const m = nccMatch(b, tpl, 40, 40, 5)!;
  assert.ok(Math.abs(m.x - 40) < 0.1 && Math.abs(m.y - 40) < 0.1);
});

function face(rot = 0, shift: Pt = { x: 0, y: 0 }): Pt[] {
  const pts: Pt[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
  const place = (i: number, x: number, y: number) => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    pts[i] = { x: 300 + x * c - y * s + shift.x, y: 300 + x * s + y * c + shift.y };
  };
  place(LM.innerEyeR, -30, 0);
  place(LM.innerEyeL, 30, 0);
  place(LM.foreheadTop, 0, -120); // image y grows downwards
  return pts;
}

test("faceFrame: up points to the forehead, and face coords survive head motion", () => {
  const f = faceFrame(face());
  assert.ok(Math.abs(f.up.y + 1) < 1e-9, "up is -y in image space");
  assert.equal(Math.round(upPx(f, { x: 300, y: 180 })), 120);
  const c = toFace(f, { x: 310, y: 160 });
  const g = faceFrame(face(0.3, { x: 25, y: -40 }));
  const p = fromFace(g, c);
  const back = toFace(g, p);
  assert.ok(Math.abs(back.u - c.u) < 1e-9 && Math.abs(back.v - c.v) < 1e-9);
  assert.ok(Math.abs(upPx(g, fromFace(g, { u: 0, v: 2 })) - 120) < 1e-6);
});

test("headAngles reads an identity transform as facing the camera", () => {
  const a = headAngles([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.equal(Math.round(a.pitch) + 0, 0);
  assert.equal(Math.round(a.yaw) + 0, 0);
  assert.equal(Math.round(a.roll) + 0, 0);
});

test("summarize: movement spread, still noise, and quality", () => {
  const s: Sample[] = [];
  for (let i = 0; i < 30; i++) s.push({ t: i * 33, phase: "still", ok: true, hair: (i % 2) * 0.2, mesh: 0, brow: 0 });
  for (let i = 0; i < 120; i++) {
    const v = 3 * Math.sin((i / 120) * Math.PI * 6);
    s.push({ t: 1000 + i * 33, phase: "move", ok: i % 10 !== 0, hair: v, mesh: v / 2, brow: 0 });
  }
  const r = summarize(s);
  assert.ok(r.hairRange > 5.2 && r.hairRange < 6.1, `hair ${r.hairRange}`);
  assert.ok(r.meshRange > 2.6 && r.meshRange < 3.1);
  assert.ok(r.stillNoise <= 0.2);
  assert.ok(Math.abs(r.quality - 0.9) < 1e-9);
});

test("repTravel: travel per forward/back rep, ignoring reaction time", () => {
  const segs = [0, 1, 2, 3, 4, 5].map((i) => ({ kind: (i % 2 ? "back" : "fwd") as "fwd" | "back", start: 1000 + i * 1500, end: 2500 + i * 1500 }));
  const amp = [4, 5, 4.5];
  const s: Sample[] = [];
  for (let t = 0; t < 10000; t += 33) {
    const seg = segs.findIndex((g) => t >= g.start && t < g.end);
    let hair = 0;
    if (seg >= 0) {
      const into = t - segs[seg].start;
      const target = seg % 2 ? amp[seg >> 1] / 2 : -amp[seg >> 1] / 2;
      hair = into < 300 ? 0 : target; // slow reaction at the start of each window
    }
    s.push({ t, phase: "move", ok: true, hair, mesh: 0, brow: 0 });
  }
  const r = repTravel(s, segs);
  assert.deepEqual(r.reps.map((x) => +x.toFixed(2)), [4, 5, 4.5]);
  assert.ok(Math.abs(r.mean - 4.5) < 1e-9);
  assert.ok(Math.abs(r.spread - 1) < 1e-9);
});

test("affineFit recovers a known transform and inverts cleanly", async () => {
  const { affineFit, applyAffine, invertAffine } = await import("./scalp-measure");
  const m: [number, number, number, number, number, number] = [1.05, -0.08, 12, 0.07, 0.98, -30];
  const src = [{ x: 0, y: 0 }, { x: 100, y: 10 }, { x: 40, y: 90 }, { x: 70, y: 50 }, { x: 10, y: 60 }];
  const dst = src.map((p) => applyAffine(m, p));
  const fit = affineFit(src, dst)!;
  fit.forEach((v, i) => assert.ok(Math.abs(v - m[i]) < 1e-6));
  const back = applyAffine(invertAffine(fit)!, dst[2]);
  assert.ok(Math.abs(back.x - 40) < 1e-6 && Math.abs(back.y - 90) < 1e-6);
});

test("detectSwings counts back-and-forth swings and ignores jitter", async () => {
  const { detectSwings } = await import("./scalp-measure");
  const v: number[] = [];
  for (let i = 0; i < 300; i++) v.push(2 * Math.sin((i / 50) * Math.PI) + 0.2 * Math.sin(i * 1.7)); // 3 cycles of +-2mm with jitter
  const s = detectSwings(v, 1);
  assert.ok(s.length >= 5 && s.length <= 6, `swings ${s.length}`);
  s.slice(1).forEach((x) => assert.ok(x > 3.6 && x < 4.6, `amp ${x}`));
  assert.equal(detectSwings(v.map((x) => x * 0.1), 1).length, 0);
});

test("similarityFit recovers rotation, scale and shift", async () => {
  const { similarityFit, applyAffine } = await import("./scalp-measure");
  const th = 0.05, s = 1.1;
  const m: [number, number, number, number, number, number] = [s * Math.cos(th), -s * Math.sin(th), 7, s * Math.sin(th), s * Math.cos(th), -4];
  const src = [{ x: 0, y: 0 }, { x: 100, y: 10 }, { x: 40, y: 90 }, { x: 70, y: 50 }];
  const fit = similarityFit(src, src.map((p) => applyAffine(m, p)))!;
  fit.forEach((v, i) => assert.ok(Math.abs(v - m[i]) < 1e-9));
});
