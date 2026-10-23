"use client";

// Scalp check (hidden lab, 1-week feasibility test). Face ID-style flow: the
// front camera finds the face, the tester puts their fingertips on top of
// their head and slides the scalp back and forth at their own pace, and the
// page reports how far the hairline travels per slide in millimetres.
//
// Tracking: a grid of small skin patches across the hairline band is followed
// by template matching; head movement is cancelled by fitting an affine
// transform to 15 rigid face points (eyes, nose, cheekbones), so only skin
// sliding over the skull counts. The iris sets the millimetre scale.
// Math lives in lib/lab/scalp-measure.ts. No video or images leave the phone;
// only the numbers are saved to LabScalpTests.

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  similarityFit,
  applyAffine,
  detectSwings,
  faceFrame,
  fromFace,
  headAngles,
  invertAffine,
  IRIS_MM,
  irisDiameterPx,
  LM,
  median,
  nccMatch,
  patch,
  percentile,
  RIGID,
  denoise,
  summarize,
  texture,
  toFace,
  type Affine,
  type FaceFrame,
  type Gray,
  type Pt,
  type Sample,
} from "@/lib/lab/scalp-measure";

type Stage = "intro" | "loading" | "align" | "place" | "still" | "move" | "result" | "error";

const PLACE_MS = 3500;
const STILL_MS = 1500;
const MOVE_MAX_MS = 12000; // finish anyway after this, so a very tight scalp still gets a reading
const SWINGS_DONE = 5; // first (partial) swing from rest + 4 full swings
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const TICKS = 72;
const GRID_U = [-0.5, -0.25, 0, 0.25, 0.5];
const GRID_DV = [-0.12, -0.04, 0.04, 0.12, 0.2]; // rows, relative to the top of the face mesh
const MAX_SPOTS = 12; // the most detailed patches (usually the skin/hair edge) win
// Head-correction patches: nose and cheekbones. Eye corners are left out,
// since blinking and eye movement throw them off.
const ANCHOR_IDS = [168, 6, 197, 195, 5, 4, 1, 116, 345, 123, 352];

type Raw = { t: number; phase: "still" | "move"; ok: boolean; hv: number; mv: number; bv: number; why?: "face" | "pose" | "spots"; n?: number };
type Spot = { p0: Pt; tpl: Gray; disp: Pt };
type Result = { travel: number; swings: number[]; small: boolean; noise: number; quality: number; samples: Sample[] };

const sub2 = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot2 = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

/** Median after dropping values far from the rest (loose hair, a finger in the way). */
function robustMedian(v: number[]): number {
  const m = median(v);
  const mad = median(v.map((x) => Math.abs(x - m)));
  const keep = v.filter((x) => Math.abs(x - m) <= 3 * mad + 0.5);
  return median(keep.length ? keep : v);
}

function analyse(raw: Raw[], iris: number[]): Result {
  const mmPerPx = IRIS_MM / median(iris);
  const still = raw.filter((x) => x.phase === "still" && x.ok);
  const base = still.length ? { h: median(still.map((x) => x.hv)), m: median(still.map((x) => x.mv)), b: median(still.map((x) => x.bv)) } : { h: 0, m: 0, b: 0 };
  const samples: Sample[] = raw.map((x) => ({ t: x.t, phase: x.phase, ok: x.ok, hair: (x.hv - base.h) * mmPerPx, mesh: (x.mv - base.m) * mmPerPx, brow: (x.bv - base.b) * mmPerPx }));
  const sum = summarize(samples);
  const move = denoise(samples.filter((s) => s.phase === "move" && s.ok).map((s) => s.hair));
  const thr = Math.max(0.8, 3 * (Number.isFinite(sum.stillNoise) ? sum.stillNoise : 0));
  const swings = detectSwings(move, thr);
  const full = swings.slice(1);
  const small = full.length < 2;
  const travel = small ? (move.length >= 5 ? percentile(move, 97) - percentile(move, 3) : NaN) : median(full);
  return { travel, swings: full, small, noise: sum.stillNoise, quality: sum.quality, samples };
}

export default function ScalpLab({ labKey }: { labKey: string }) {
  const [stage, setStage] = useState<Stage>("intro");
  const [title, setTitle] = useState("Scalp check");
  const [sub, setSub] = useState("Measures how far your scalp moves.");
  const [lit, setLit] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<"before" | "after" | "">("");
  const [saved, setSaved] = useState<"" | "saving" | "ok" | "fail">("");
  const [error, setError] = useState("");
  const [diag, setDiag] = useState("");
  const keyRef = useRef(labKey);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const drawnAt = useRef(-1);
  const lmRef = useRef<FaceLandmarker | null>(null);
  const stageRef = useRef<Stage>("intro");
  const run = useRef({
    stageAt: 0,
    recAt: 0,
    moveAt: 0,
    holdMsgUntil: 0,
    steady: [] as Pt[],
    rigid0: [] as Pt[],
    up0: { x: 0, y: -1 } as Pt,
    top0: { x: 0, y: 0 } as Pt,
    brow0: { x: 0, y: 0 } as Pt,
    spots: [] as Spot[],
    anchors: [] as { p0: Pt; tpl: Gray }[], // skin patches on rigid points (nose, eye corners, cheeks)
    patchR: 7,
    radius: 10,
    pose0: null as { pitch: number; yaw: number } | null,
    iris: [] as number[],
    raw: [] as Raw[],
    mmPerPx: 0,
    thr: 1,
  });

  useEffect(() => {
    try {
      setName(localStorage.getItem("lab_name") ?? "");
    } catch {}
  }, []);

  const go = (s: Stage) => {
    stageRef.current = s;
    run.current.stageAt = performance.now();
    setStage(s);
  };
  const say = (t: string, s = "") => {
    setTitle(t);
    setSub(s);
  };

  // Grayscale crop of the current video frame.
  const grab = useCallback((x0: number, y0: number, w: number, h: number): { g: Gray; x0: number; y0: number } | null => {
    const v = videoRef.current!;
    const W = v.videoWidth;
    const H = v.videoHeight;
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    w = Math.min(W - x0, Math.ceil(w));
    h = Math.min(H - y0, Math.ceil(h));
    if (w < 8 || h < 8) return null;
    const c = (workRef.current ??= document.createElement("canvas"));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    // Draw the frame once per video frame, however many crops we take.
    if (drawnAt.current !== v.currentTime) {
      ctx.drawImage(v, 0, 0, W, H);
      drawnAt.current = v.currentTime;
    }
    const px = ctx.getImageData(x0, y0, w, h).data;
    const data = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) data[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    return { g: { data, w, h }, x0, y0 };
  }, []);

  const bounds = (ps: Pt[], pad: number) => {
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad] as const;
  };

  const finish = useCallback(() => {
    const r = run.current;
    const res = analyse(r.raw, r.iris);
    setResult(res);
    setLit(TICKS);
    setSaved("");
    const good = Number.isFinite(res.travel) && res.quality >= 0.5 && !(res.noise > 2);
    // Diagnostics for every try, good or not, so failures can be understood.
    const mv = r.raw.filter((x) => x.phase === "move");
    const pct = (k: Raw["why"]) => (mv.length ? Math.round((mv.filter((x) => x.why === k).length / mv.length) * 100) : 0);
    const v = videoRef.current;
    const diag = {
      good,
      spots: r.spots.length,
      anchors: r.anchors.length,
      w: v?.videoWidth ?? 0,
      h: v?.videoHeight ?? 0,
      patch_r: r.patchR,
      radius: r.radius,
      move_frames: mv.length,
      ok_pct: Math.round(res.quality * 100),
      no_face_pct: pct("face"),
      head_pct: pct("pose"),
      lost_spots_pct: pct("spots"),
      median_spots: median(mv.map((x) => x.n ?? 0)),
      noise_mm: res.noise,
      swings: res.swings.length,
      travel_mm: res.travel,
    };
    setDiag(`ok ${diag.ok_pct}% · lost face ${diag.no_face_pct}% · head moved ${diag.head_pct}% · lost hairline ${diag.lost_spots_pct}% · spots ${diag.median_spots}/${diag.spots} · still noise ${Number.isFinite(res.noise) ? res.noise.toFixed(1) : "–"} mm · ${diag.w}×${diag.h}`);
    let who = "";
    try {
      who = localStorage.getItem("lab_name") ?? "";
    } catch {}
    const st = res.samples;
    const step = Math.max(1, Math.ceil(st.length / 400));
    fetch("/api/lab/scalp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: keyRef.current,
        name: who || "unknown",
        test: "push",
        auto: true,
        diag,
        summary: { ...summarize(st), reps: res.swings, travel: res.travel },
        trace: st.filter((_, i) => i % step === 0).map((x) => [Math.round(x.t), x.ok ? 1 : 0, x.hair, x.mesh, x.brow]),
        mm_per_px: IRIS_MM / median(r.iris),
        iris_px: median(r.iris),
        video_w: diag.w,
        video_h: diag.h,
      }),
    }).catch(() => {});
    if (!good) say("Couldn't get a clean reading", "Keep your head still, your fingertips behind your hairline, and your face in the circle.");
    else if (res.small) say("Very little movement", "Push firmly on top of your head and slide again.");
    else say("Scalp movement", res.swings.map((x) => x.toFixed(1)).join("  ·  ") + " mm");
    go("result");
  }, []);

  const save = async () => {
    const r = run.current;
    if (!result || !name.trim()) return;
    try {
      localStorage.setItem("lab_name", name.trim());
    } catch {}
    setSaved("saving");
    const s = result.samples;
    const step = Math.max(1, Math.ceil(s.length / 400));
    const spread = result.swings.length > 1 ? Math.max(...result.swings) - Math.min(...result.swings) : null;
    const ok = await fetch("/api/lab/scalp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: labKey,
        name,
        test: "push",
        phase,
        note: result.small ? "small" : "",
        summary: { ...summarize(s), reps: result.swings, travel: result.travel, travelSpread: spread },
        trace: s.filter((_, i) => i % step === 0).map((x) => [Math.round(x.t), x.ok ? 1 : 0, x.hair, x.mesh, x.brow]),
        mm_per_px: IRIS_MM / median(r.iris),
        iris_px: median(r.iris),
        point: { spots: r.spots.length },
        video_w: videoRef.current?.videoWidth,
        video_h: videoRef.current?.videoHeight,
      }),
    })
      .then((x) => x.ok)
      .catch(() => false);
    setSaved(ok ? "ok" : "fail");
  };

  // Per-frame loop: face mesh, alignment, tracking, drawing.
  const loop = useCallback(() => {
    const v = videoRef.current;
    const lm = lmRef.current;
    const cv = overlayRef.current;
    if (!v || !lm || !cv) return;
    let lastT = -1;
    const tick = () => {
      const s = stageRef.current;
      if (s === "intro" || s === "loading" || s === "error" || s === "result") return;
      requestAnimationFrame(tick);
      if (v.readyState < 2 || v.currentTime === lastT) return;
      lastT = v.currentTime;
      const W = v.videoWidth;
      const H = v.videoHeight;
      if (cv.width !== W || cv.height !== H) {
        cv.width = W;
        cv.height = H;
      }
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);
      const now = performance.now();
      const r = run.current;
      const res = lm.detectForVideo(v, now);
      const face = res.faceLandmarks?.[0];
      const pts: Pt[] | null = face ? face.map((p) => ({ x: p.x * W, y: p.y * H })) : null;
      const f: FaceFrame | null = pts ? faceFrame(pts) : null;
      const m = res.facialTransformationMatrixes?.[0]?.data;
      const pose = m ? headAngles(m) : null;
      const inStage = now - r.stageAt;
      const D = Math.min(W, H);

      if (s === "align") {
        if (now < r.holdMsgUntil) return;
        if (!f || !pts) {
          r.steady = [];
          say("Position your face in the circle");
          return;
        }
        const off = Math.hypot(f.anchor.x - W / 2, f.anchor.y - H / 2) / D;
        const size = f.eyeDist / D;
        const top = fromFace(f, { u: 0, v: toFace(f, pts[LM.foreheadTop]).v + 0.45 });
        if (size < 0.07) say("Move a little closer");
        else if (size > 0.2 || top.y < 0) say("Move a little further back", "Your whole hairline needs to be in the circle.");
        else if (off > 0.12) say("Center your face in the circle");
        else {
          r.steady.push(f.anchor);
          if (r.steady.length > 18) r.steady.shift();
          const steady = r.steady.length >= 18 && Math.max(...r.steady.map((p) => Math.hypot(p.x - f.anchor.x, p.y - f.anchor.y))) < D * 0.012;
          say("Hold the phone steady");
          if (steady) {
            say("Put your fingertips on top of your head", "Behind your hairline, so the camera can still see it.");
            go("place");
          }
          return;
        }
        r.steady = [];
        return;
      }

      if (s === "place") {
        if (inStage < PLACE_MS) return;
        if (!f || !pts) {
          say("Position your face in the circle");
          go("align");
          return;
        }
        // Lay a grid of skin patches over the hairline band and keep the ones
        // with enough detail to follow.
        const vTop = toFace(f, pts[LM.foreheadTop]).v;
        r.patchR = Math.max(8, Math.min(18, Math.round(f.eyeDist * 0.12)));
        r.radius = Math.max(6, Math.min(12, Math.round(f.eyeDist * 0.08)));
        const centres = GRID_DV.flatMap((dv) => GRID_U.map((u) => fromFace(f, { u, v: vTop + dv })));
        const crop = grab(...bounds(centres, r.patchR + 2));
        let spots: (Spot & { tex: number })[] = [];
        let bright = 0;
        for (const c of centres) {
          const tpl = crop ? patch(crop.g, c.x - crop.x0, c.y - crop.y0, r.patchR) : null;
          if (!tpl) continue;
          bright += tpl.data.reduce((a, b) => a + b, 0) / tpl.data.length;
          const tex = texture(tpl);
          if (tex >= 4) spots.push({ p0: c, tpl, disp: { x: 0, y: 0 }, tex });
        }
        if (spots.length < 6) {
          const dark = bright / Math.max(1, centres.length) < 70;
          say(dark ? "Move into better light" : "Pull your hair off your forehead", "The camera needs a clear view of your hairline.");
          r.holdMsgUntil = now + 3000;
          r.steady = [];
          go("align");
          return;
        }
        spots = spots.sort((a, b) => b.tex - a.tex).slice(0, MAX_SPOTS);
        r.spots = spots;
        r.rigid0 = RIGID.map((i) => pts[i]);
        const ar = r.patchR;
        const a0 = ANCHOR_IDS.map((i) => pts[i]);
        const acrop = grab(...bounds(a0, ar + 2));
        r.anchors = a0.flatMap((p0) => {
          const tpl = acrop ? patch(acrop.g, p0.x - acrop.x0, p0.y - acrop.y0, ar) : null;
          return tpl && texture(tpl) >= 4 ? [{ p0, tpl }] : [];
        });
        r.up0 = f.up;
        r.top0 = pts[LM.foreheadTop];
        r.brow0 = { x: (pts[LM.browR].x + pts[LM.browL].x) / 2, y: (pts[LM.browR].y + pts[LM.browL].y) / 2 };
        r.pose0 = pose ? { pitch: pose.pitch, yaw: pose.yaw } : null;
        Object.assign(r, { raw: [], iris: [], recAt: now, mmPerPx: 0 });
        say("Hold still");
        go("still");
        return;
      }

      // Recording.
      const t = now - r.recAt;
      if (s === "still" && t >= STILL_MS) {
        r.mmPerPx = IRIS_MM / median(r.iris);
        const still = denoise(r.raw.filter((x) => x.ok).map((x) => x.hv * r.mmPerPx));
        const noise = still.length >= 5 ? percentile(still, 97) - percentile(still, 3) : 0;
        r.thr = Math.max(0.8, 3 * noise);
        r.moveAt = now;
        say("Slide your scalp back and forth");
        go("move");
      }
      if (s === "move" && now - r.moveAt >= MOVE_MAX_MS) {
        finish();
        return;
      }
      const phaseNow: Raw["phase"] = stageRef.current === "move" ? "move" : "still";
      // Head motion: first from the face mesh, then refined by following the
      // skin texture on the rigid points themselves (the mesh lags a little
      // when the head moves).
      let M: Affine | null = pts ? similarityFit(r.rigid0, RIGID.map((i) => pts[i])) : null;
      if (M && r.anchors.length >= 5) {
        const guess = M;
        const ap = r.anchors.map((a) => applyAffine(guess, a.p0));
        const acrop = grab(...bounds(ap, r.patchR + r.radius + 2));
        const src: Pt[] = [];
        const dst: Pt[] = [];
        ap.forEach((p, i) => {
          const hit = acrop ? nccMatch(acrop.g, r.anchors[i].tpl, p.x - acrop.x0, p.y - acrop.y0, r.radius) : null;
          if (hit && hit.score >= 0.7) {
            src.push(r.anchors[i].p0);
            dst.push({ x: hit.x + acrop!.x0, y: hit.y + acrop!.y0 });
          }
        });
        if (src.length >= 5) {
          // Fit, drop patches that disagree with the rest, fit again.
          const first = similarityFit(src, dst);
          if (first) {
            const res = src.map((p, i) => Math.hypot(applyAffine(first, p).x - dst[i].x, applyAffine(first, p).y - dst[i].y));
            const cut = Math.max(1.5, 2.5 * median(res));
            const keep = res.map((e, i) => (e <= cut ? i : -1)).filter((i) => i >= 0);
            M = (keep.length >= 5 ? similarityFit(keep.map((i) => src[i]), keep.map((i) => dst[i])) : null) ?? first;
          }
        }
      }
      const Minv = M ? invertAffine(M) : null;
      if (!pts || !M || !Minv) {
        r.raw.push({ t, phase: phaseNow, ok: false, hv: 0, mv: 0, bv: 0, why: "face" });
        return;
      }
      const preds = r.spots.map((sp) => applyAffine(M, { x: sp.p0.x + sp.disp.x, y: sp.p0.y + sp.disp.y }));
      const crop = grab(...bounds(preds, r.patchR + r.radius + 2));
      const du: number[] = [];
      preds.forEach((p, i) => {
        const sp = r.spots[i];
        const hit = crop ? nccMatch(crop.g, sp.tpl, p.x - crop.x0, p.y - crop.y0, r.radius) : null;
        const ok = !!hit && hit.score >= 0.5;
        if (ok) {
          const back = applyAffine(Minv, { x: hit!.x + crop!.x0, y: hit!.y + crop!.y0 });
          sp.disp = sub2(back, sp.p0);
          du.push(dot2(sp.disp, r.up0));
        }
        ctx.fillStyle = ok ? "rgba(48,209,88,0.9)" : "rgba(255,255,255,0.25)";
        ctx.beginPath();
        ctx.arc(ok ? hit!.x + crop!.x0 : p.x, ok ? hit!.y + crop!.y0 : p.y, D * 0.005, 0, Math.PI * 2);
        ctx.fill();
      });
      const poseOk = !r.pose0 || !pose || (Math.abs(pose.pitch - r.pose0.pitch) < 15 && Math.abs(pose.yaw - r.pose0.yaw) < 18);
      const enough = du.length >= Math.max(3, Math.ceil(r.spots.length * 0.25));
      const ok = enough && poseOk;
      const browNow = { x: (pts[LM.browR].x + pts[LM.browL].x) / 2, y: (pts[LM.browR].y + pts[LM.browL].y) / 2 };
      r.raw.push({
        t,
        phase: phaseNow,
        ok,
        hv: du.length ? robustMedian(du) : 0,
        mv: dot2(sub2(applyAffine(Minv, pts[LM.foreheadTop]), r.top0), r.up0),
        bv: dot2(sub2(applyAffine(Minv, browNow), r.brow0), r.up0),
        why: !poseOk ? "pose" : !enough ? "spots" : undefined,
        n: du.length,
      });
      if (phaseNow === "still") {
        r.iris.push(irisDiameterPx(pts));
        return;
      }
      if (!poseOk) setSub("Keep your head still. Only your scalp moves.");
      else if (!ok) setSub("Keep your fingertips behind your hairline.");
      else setSub("");
      // Count swings so far; the ring fills as you go.
      const live = denoise(r.raw.filter((x) => x.phase === "move" && x.ok).map((x) => x.hv * r.mmPerPx));
      const swings = detectSwings(live, r.thr).length;
      setLit(Math.round((Math.min(swings, SWINGS_DONE) / SWINGS_DONE) * TICKS));
      if (swings >= SWINGS_DONE) finish();
    };
    requestAnimationFrame(tick);
  }, [finish, grab]);

  const start = async () => {
    setError("");
    go("loading");
    say("Starting camera…");
    try {
      if (!lmRef.current) {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const files = await FilesetResolver.forVisionTasks(WASM);
        const opts = (delegate: "GPU" | "CPU") => ({
          baseOptions: { modelAssetPath: "/lab/face_landmarker.task", delegate },
          runningMode: "VIDEO" as const,
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
        });
        lmRef.current = await FaceLandmarker.createFromOptions(files, opts("GPU")).catch(() => FaceLandmarker.createFromOptions(files, opts("CPU")));
      }
      const v = videoRef.current!;
      if (!v.srcObject) {
        v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        await v.play();
      }
      setResult(null);
      setLit(0);
      run.current.steady = [];
      say("Position your face in the circle");
      go("align");
      loop();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      say("Camera unavailable", "Allow camera access for this page and try again.");
      go("error");
    }
  };

  const good = !!result && Number.isFinite(result.travel) && result.quality >= 0.5 && !(result.noise > 2);
  const live = stage !== "intro" && stage !== "loading" && stage !== "error";

  return (
    <main style={S.main}>
      <style>{CSS}</style>
      <div style={S.ringBox}>
        <svg viewBox="-100 -100 200 200" style={S.ring} aria-hidden>
          {Array.from({ length: TICKS }, (_, i) => {
            const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2;
            const on = i < lit;
            return (
              <line
                key={i}
                x1={r3(Math.cos(a) * 88)}
                y1={r3(Math.sin(a) * 88)}
                x2={r3(Math.cos(a) * 97)}
                y2={r3(Math.sin(a) * 97)}
                stroke={on ? "#30D158" : "#3A3A3C"}
                strokeWidth={2.2}
                strokeLinecap="round"
                className={stage === "place" ? "pulse" : undefined}
                style={{ transition: "stroke 0.25s ease", animationDelay: `${(i % 12) * 0.05}s` }}
              />
            );
          })}
        </svg>
        <div style={S.circle}>
          <video ref={videoRef} playsInline muted style={{ ...S.media, opacity: live ? 1 : 0 }} />
          <canvas ref={overlayRef} style={S.media} />
          {!live && <div style={S.glyph} />}
          {stage === "result" && (
            <div style={S.resultFill} className="fade">
              {good ? (
                <>
                  <div style={S.num}>{result!.travel.toFixed(1)}</div>
                  <div style={S.unit}>mm</div>
                </>
              ) : (
                <div style={S.unit}>–</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div key={title} className="fade" style={S.text}>
        <h1 style={S.title}>{title}</h1>
        {sub && <p style={S.sub}>{sub}</p>}
        {error && <p style={S.small}>{error}</p>}
        {stage === "result" && diag && <p style={S.diag}>{diag}</p>}
      </div>

      <div style={S.actions}>
        {(stage === "intro" || stage === "error") && (
          <button style={S.primary} onClick={start}>
            {stage === "error" ? "Try again" : "Start"}
          </button>
        )}
        {stage === "result" && (
          <div className="fade" style={S.form}>
            {good && saved !== "ok" && (
              <>
                <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                <div style={S.chips}>
                  {(
                    [
                      ["before", "Before a session"],
                      ["after", "Just did a session"],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} style={{ ...S.chip, ...(phase === k ? S.chipOn : null) }} onClick={() => setPhase(k)}>
                      {l}
                    </button>
                  ))}
                </div>
                <button style={{ ...S.primary, opacity: name.trim() && phase ? 1 : 0.35 }} disabled={!name.trim() || !phase || saved === "saving"} onClick={save}>
                  {saved === "saving" ? "Saving…" : "Save"}
                </button>
                {saved === "fail" && <p style={S.small}>Didn&apos;t save. Check your connection and tap Save again.</p>}
              </>
            )}
            {saved === "ok" && <p style={S.savedTxt}>Saved</p>}
            <button style={S.secondary} onClick={start}>
              Measure again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

const CSS = `
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
.fade { animation: fadeIn 0.35s ease both }
@keyframes pulse { 0%,100% { stroke: #3A3A3C } 50% { stroke: #8E8E93 } }
.pulse { animation: pulse 1.4s ease-in-out infinite }
`;

const S: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100dvh",
    background: "#000",
    color: "#fff",
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", system-ui, sans-serif',
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "12vh 24px 40px",
    boxSizing: "border-box",
  },
  ringBox: { position: "relative", width: "min(78vw, 340px)", aspectRatio: "1" },
  ring: { position: "absolute", inset: 0, width: "100%", height: "100%" },
  circle: { position: "absolute", inset: "11%", borderRadius: "50%", overflow: "hidden", background: "#0D0D0F" },
  media: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", transition: "opacity 0.4s ease" },
  glyph: { position: "absolute", inset: "30%", borderRadius: "50%", border: "1.5px solid #2C2C2E" },
  resultFill: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  num: { fontSize: "clamp(56px, 18vw, 84px)", fontWeight: 200, letterSpacing: -2, lineHeight: 1 },
  unit: { fontSize: 20, fontWeight: 400, color: "#8E8E93", marginTop: 4 },
  text: { marginTop: 36, textAlign: "center", maxWidth: 320, minHeight: 84 },
  title: { fontSize: 22, fontWeight: 600, letterSpacing: -0.3, margin: 0, lineHeight: 1.25 },
  sub: { fontSize: 15, color: "#8E8E93", margin: "8px 0 0", lineHeight: 1.4 },
  small: { fontSize: 13, color: "#8E8E93", margin: "8px 0 0" },
  actions: { marginTop: "auto", width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 10, paddingTop: 24 },
  form: { display: "flex", flexDirection: "column", gap: 10 },
  primary: { background: "#fff", color: "#000", border: 0, borderRadius: 14, padding: "16px", fontSize: 17, fontWeight: 600, fontFamily: "inherit" },
  secondary: { background: "transparent", color: "#0A84FF", border: 0, padding: "12px", fontSize: 17, fontFamily: "inherit" },
  input: { background: "#1C1C1E", border: 0, borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 17, fontFamily: "inherit", outline: "none" },
  chips: { display: "flex", gap: 8 },
  chip: { flex: 1, background: "#1C1C1E", color: "#8E8E93", border: 0, borderRadius: 12, padding: "12px 8px", fontSize: 15, fontFamily: "inherit" },
  chipOn: { background: "#fff", color: "#000" },
  diag: { fontSize: 11, color: "#636366", margin: "10px 0 0", lineHeight: 1.4 },
  savedTxt: { textAlign: "center", color: "#30D158", fontSize: 17, margin: "4px 0" },
};
