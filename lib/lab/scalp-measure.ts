// Scalp mobility lab: the math behind /lab/scalp, kept free of browser APIs
// so it can be unit-tested.
//
// How a measurement works:
//   - The face mesh gives us points that don't move when the scalp slides
//     (inner eye corners). Their midpoint is the anchor, the line between them
//     sets "sideways", and the perpendicular towards the forehead is "up".
//   - A patch of skin at the hairline (where the tester tapped) is followed by
//     template matching (normalised cross-correlation), not by the mesh, since
//     the mesh is fitted to face shape and may not follow sliding skin.
//   - Movement = how far that patch moves along "up", relative to the anchor.
//   - Pixels become millimetres through the iris (about 11.7 mm across in
//     almost every adult), measured while the tester holds still.

export type Pt = { x: number; y: number };

export const IRIS_MM = 11.7;

// MediaPipe Face Landmarker indices (478-point mesh with irises).
export const LM = {
  innerEyeR: 133,
  innerEyeL: 362,
  foreheadTop: 10,
  browR: 105,
  browL: 334,
  irisR: [469, 470, 471, 472],
  irisL: [474, 475, 476, 477],
} as const;

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);

/** Iris diameter in pixels: mean of both irises' horizontal and vertical spans. */
export function irisDiameterPx(pts: Pt[]): number {
  const span = (ids: readonly number[]) => {
    const [a, b, c, d] = ids.map((i) => pts[i]);
    return [len(sub(a, c)), len(sub(b, d))];
  };
  const all = [...span(LM.irisR), ...span(LM.irisL)];
  return all.reduce((s, v) => s + v, 0) / all.length;
}

export type FaceFrame = { anchor: Pt; ex: Pt; up: Pt; eyeDist: number };

/** Anchor + axes from the inner eye corners; "up" points towards the forehead. */
export function faceFrame(pts: Pt[]): FaceFrame {
  const r = pts[LM.innerEyeR];
  const l = pts[LM.innerEyeL];
  const anchor = mul(add(r, l), 0.5);
  const v = sub(l, r);
  const eyeDist = len(v);
  const ex = mul(v, 1 / eyeDist);
  let up: Pt = { x: ex.y, y: -ex.x };
  if (dot(up, sub(pts[LM.foreheadTop], anchor)) < 0) up = mul(up, -1);
  return { anchor, ex, up, eyeDist };
}

/** Point -> face coordinates (u sideways, v up), in eye-distance units. */
export function toFace(f: FaceFrame, p: Pt): { u: number; v: number } {
  const d = sub(p, f.anchor);
  return { u: dot(d, f.ex) / f.eyeDist, v: dot(d, f.up) / f.eyeDist };
}

export function fromFace(f: FaceFrame, c: { u: number; v: number }): Pt {
  return add(f.anchor, add(mul(f.ex, c.u * f.eyeDist), mul(f.up, c.v * f.eyeDist)));
}

/** Signed distance of p along "up" from the anchor, in pixels. */
export function upPx(f: FaceFrame, p: Pt): number {
  return dot(sub(p, f.anchor), f.up);
}

export type Gray = { data: Float32Array; w: number; h: number };

/** Square patch of side 2r+1 centred on (cx, cy), or null if it falls off the image. */
export function patch(img: Gray, cx: number, cy: number, r: number): Gray | null {
  const x0 = Math.round(cx) - r;
  const y0 = Math.round(cy) - r;
  const s = 2 * r + 1;
  if (x0 < 0 || y0 < 0 || x0 + s > img.w || y0 + s > img.h) return null;
  const out = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) out[y * s + x] = img.data[(y0 + y) * img.w + x0 + x];
  return { data: out, w: s, h: s };
}

function zeroMean(t: Gray): { d: Float32Array; norm: number } {
  let m = 0;
  for (const v of t.data) m += v;
  m /= t.data.length;
  const d = new Float32Array(t.data.length);
  let n = 0;
  for (let i = 0; i < d.length; i++) {
    d[i] = t.data[i] - m;
    n += d[i] * d[i];
  }
  return { d, norm: Math.sqrt(n) };
}

/**
 * Find the template inside img near (cx, cy), searching +-radius pixels.
 * Returns the sub-pixel centre of the best match and its correlation (-1..1).
 */
export function nccMatch(img: Gray, tpl: Gray, cx: number, cy: number, radius: number): { x: number; y: number; score: number } | null {
  const r = (tpl.w - 1) / 2;
  const t = zeroMean(tpl);
  if (t.norm < 1e-6) return null;
  const size = 2 * radius + 1;
  const scores = new Float32Array(size * size).fill(-2);
  const bx = Math.round(cx);
  const by = Math.round(cy);
  let best = -2;
  let bi = -1;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x0 = bx + dx - r;
      const y0 = by + dy - r;
      if (x0 < 0 || y0 < 0 || x0 + tpl.w > img.w || y0 + tpl.h > img.h) continue;
      let m = 0;
      for (let y = 0; y < tpl.h; y++) {
        const row = (y0 + y) * img.w + x0;
        for (let x = 0; x < tpl.w; x++) m += img.data[row + x];
      }
      m /= tpl.data.length;
      let num = 0;
      let den = 0;
      for (let y = 0; y < tpl.h; y++) {
        const row = (y0 + y) * img.w + x0;
        for (let x = 0; x < tpl.w; x++) {
          const v = img.data[row + x] - m;
          num += v * t.d[y * tpl.w + x];
          den += v * v;
        }
      }
      const s = den > 1e-6 ? num / (Math.sqrt(den) * t.norm) : -1;
      const i = (dy + radius) * size + dx + radius;
      scores[i] = s;
      if (s > best) {
        best = s;
        bi = i;
      }
    }
  }
  if (bi < 0) return null;
  const iy = Math.floor(bi / size);
  const ix = bi % size;
  // Parabolic sub-pixel refinement on each axis.
  const refine = (a: number, b: number, c: number) => {
    if (a < -1 || c < -1) return 0;
    const den = a - 2 * b + c;
    return Math.abs(den) < 1e-9 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
  };
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? -2 : scores[y * size + x]);
  const ox = refine(at(ix - 1, iy), best, at(ix + 1, iy));
  const oy = refine(at(ix, iy - 1), best, at(ix, iy + 1));
  return { x: bx + ix - radius + ox, y: by + iy - radius + oy, score: best };
}

/** Pitch / yaw / roll in degrees from MediaPipe's 4x4 column-major transform. */
export function headAngles(m: ArrayLike<number>): { pitch: number; yaw: number; roll: number } {
  const deg = 180 / Math.PI;
  return {
    pitch: Math.atan2(m[6], m[10]) * deg,
    yaw: Math.asin(Math.max(-1, Math.min(1, -m[2]))) * deg,
    roll: Math.atan2(m[1], m[0]) * deg,
  };
}

export function median(a: number[]): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

export function percentile(a: number[], p: number): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const i = Math.min(s.length - 1, Math.max(0, (p / 100) * (s.length - 1)));
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/** Running median over a window, to knock out single-frame tracking glitches. */
export function smooth(a: number[], win = 5): number[] {
  const h = win >> 1;
  return a.map((_, i) => median(a.slice(Math.max(0, i - h), i + h + 1)));
}

export type Sample = {
  t: number; // ms since recording start
  phase: "still" | "move";
  ok: boolean; // tracking + head pose good enough to count
  hair: number; // hairline patch movement along "up", mm (vs. the still median)
  mesh: number; // forehead-top mesh point, same units
  brow: number; // eyebrows, same units
};

export type Summary = {
  hairRange: number; // mm, spread of the hairline during the movement
  meshRange: number;
  browRange: number;
  stillNoise: number; // mm, spread while holding still: the measurement's own noise
  quality: number; // share of movement frames that counted, 0..1
  frames: number;
};

/** Spread (97th minus 3rd percentile) of each signal during the movement phase. */
export function summarize(samples: Sample[]): Summary {
  const move = samples.filter((s) => s.phase === "move");
  const good = move.filter((s) => s.ok);
  const still = samples.filter((s) => s.phase === "still" && s.ok);
  const spread = (v: number[]) => (v.length < 5 ? NaN : percentile(v, 97) - percentile(v, 3));
  const sm = (k: "hair" | "mesh" | "brow", list: Sample[]) => smooth(list.map((s) => s[k]));
  return {
    hairRange: spread(sm("hair", good)),
    meshRange: spread(sm("mesh", good)),
    browRange: spread(sm("brow", good)),
    stillNoise: spread(sm("hair", still)),
    quality: move.length ? good.length / move.length : 0,
    frames: samples.length,
  };
}

export type Segment = { kind: "fwd" | "back"; start: number; end: number }; // ms, same clock as Sample.t

/**
 * Guided push test: the tester slides the scalp forward, then back, a few
 * times. Each rep's travel is the gap between where the hairline sits at the
 * end of "back" and at the end of "forward" (first 40% of each window skipped
 * for reaction time). Returns per-rep travel in mm plus mean and spread.
 */
export function repTravel(samples: Sample[], segments: Segment[]): { reps: number[]; mean: number; spread: number } {
  const settled = (s: Segment) => {
    const from = s.start + 0.4 * (s.end - s.start);
    const v = samples.filter((x) => x.ok && x.t >= from && x.t < s.end).map((x) => x.hair);
    return v.length >= 3 ? median(v) : NaN;
  };
  const reps: number[] = [];
  for (let i = 0; i + 1 < segments.length; i += 2) {
    const a = settled(segments[i]);
    const b = settled(segments[i + 1]);
    if (Number.isFinite(a) && Number.isFinite(b)) reps.push(Math.abs(b - a));
  }
  return {
    reps,
    mean: reps.length ? reps.reduce((s, v) => s + v, 0) / reps.length : NaN,
    spread: reps.length > 1 ? Math.max(...reps) - Math.min(...reps) : NaN,
  };
}
