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

/**
 * Knock out single-frame glitches (running median of 3), then average over
 * 5 frames (~0.2 s). Real slides take far longer, so their size survives;
 * frame-to-frame jitter shrinks by about half.
 */
export function denoise(a: number[]): number[] {
  const m = smooth(a, 3);
  return m.map((_, i) => {
    const w = m.slice(Math.max(0, i - 2), i + 3);
    return w.reduce((s, v) => s + v, 0) / w.length;
  });
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
  const sm = (k: "hair" | "mesh" | "brow", list: Sample[]) => denoise(list.map((s) => s[k]));
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

// Mesh points that stay put when the scalp slides (eye corners, nose bridge
// and tip, cheekbones). Fitting the head's movement to all of them cancels
// small nods and turns far better than two eye corners alone.
export const RIGID = [33, 133, 362, 263, 168, 6, 197, 195, 5, 4, 1, 116, 345, 123, 352] as const;

/** Affine transform [a, b, c, d, e, f]: x' = a x + b y + c, y' = d x + e y + f. */
export type Affine = [number, number, number, number, number, number];

function solve3(m: number[][], r: number[]): number[] | null {
  const [a, b, c] = m;
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (Math.abs(det) < 1e-9) return null;
  const col = (i: number) => m.map((row, k) => row.map((v, j) => (j === i ? r[k] : v)));
  const d3 = (n: number[][]) => n[0][0] * (n[1][1] * n[2][2] - n[1][2] * n[2][1]) - n[0][1] * (n[1][0] * n[2][2] - n[1][2] * n[2][0]) + n[0][2] * (n[1][0] * n[2][1] - n[1][1] * n[2][0]);
  return [d3(col(0)) / det, d3(col(1)) / det, d3(col(2)) / det];
}

/** Least-squares affine map from src points to dst points. */
export function affineFit(src: Pt[], dst: Pt[]): Affine | null {
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0;
  let ux = 0, uy = 0, u1 = 0, vx = 0, vy = 0, v1 = 0;
  src.forEach((p, i) => {
    const q = dst[i];
    sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y; sx += p.x; sy += p.y;
    ux += p.x * q.x; uy += p.y * q.x; u1 += q.x;
    vx += p.x * q.y; vy += p.y * q.y; v1 += q.y;
  });
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, src.length]];
  const r1 = solve3(M, [ux, uy, u1]);
  const r2 = solve3(M, [vx, vy, v1]);
  return r1 && r2 ? [r1[0], r1[1], r1[2], r2[0], r2[1], r2[2]] : null;
}

export function applyAffine(m: Affine, p: Pt): Pt {
  return { x: m[0] * p.x + m[1] * p.y + m[2], y: m[3] * p.x + m[4] * p.y + m[5] };
}

export function invertAffine(m: Affine): Affine | null {
  const det = m[0] * m[4] - m[1] * m[3];
  if (Math.abs(det) < 1e-12) return null;
  const a = m[4] / det, b = -m[1] / det, d = -m[3] / det, e = m[0] / det;
  return [a, b, -(a * m[2] + b * m[5]), d, e, -(d * m[2] + e * m[5])];
}

/** Standard deviation of a patch: how much detail there is to lock onto. */
export function texture(g: Gray): number {
  let m = 0;
  for (const v of g.data) m += v;
  m /= g.data.length;
  let s = 0;
  for (const v of g.data) s += (v - m) * (v - m);
  return Math.sqrt(s / g.data.length);
}

/**
 * Free-paced back-and-forth: find the swings in a movement trace. A swing is
 * a move from one turning point to the next that is at least `thr` mm, so
 * jitter smaller than that never counts. Returns each swing's size in mm.
 */
export function detectSwings(v: number[], thr: number): number[] {
  const swings: number[] = [];
  if (v.length < 3) return swings;
  let dir = 0; // +1 rising, -1 falling, 0 unknown
  let lo = v[0];
  let hi = v[0];
  let ext = v[0]; // last confirmed turning point
  for (const x of v) {
    if (dir === 0) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
      if (hi - lo >= thr) {
        dir = x === hi ? 1 : -1;
        ext = dir === 1 ? lo : hi;
        hi = lo = x;
      }
      continue;
    }
    if (dir === 1) {
      if (x > hi) hi = x;
      else if (hi - x >= thr) {
        swings.push(hi - ext);
        ext = hi;
        dir = -1;
        lo = x;
      }
    } else {
      if (x < lo) lo = x;
      else if (x - lo >= thr) {
        swings.push(ext - lo);
        ext = lo;
        dir = 1;
        hi = x;
      }
    }
  }
  return swings;
}

/**
 * Least-squares similarity (shift, rotation, uniform scale) from src to dst,
 * as an Affine. Fewer degrees of freedom than affineFit, so landmark jitter is
 * amplified less when projecting up to the hairline.
 */
export function similarityFit(src: Pt[], dst: Pt[]): Affine | null {
  const n = src.length;
  if (n < 2) return null;
  const ca = src.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n }), { x: 0, y: 0 });
  const cb = dst.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n }), { x: 0, y: 0 });
  let A = 0, B = 0, N = 0;
  src.forEach((p, i) => {
    const ax = p.x - ca.x, ay = p.y - ca.y;
    const bx = dst[i].x - cb.x, by = dst[i].y - cb.y;
    A += ax * bx + ay * by;
    B += ax * by - ay * bx;
    N += ax * ax + ay * ay;
  });
  if (N < 1e-9) return null;
  const a = A / N; // s cos
  const b = B / N; // s sin
  return [a, -b, cb.x - (a * ca.x - b * ca.y), b, a, cb.y - (b * ca.x + a * ca.y)];
}
