"use client";

// Scalp check (hidden lab, 1-week feasibility test). Face ID-style flow: the
// front camera finds the face, then guides the tester to slide their scalp
// forward and back with their fingertips while it follows a patch of skin at
// the hairline, and reports how far it travelled in millimetres.
// Math lives in lib/lab/scalp-measure.ts. No video or images leave the phone;
// only the numbers are saved to LabScalpTests.

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  faceFrame,
  fromFace,
  headAngles,
  IRIS_MM,
  irisDiameterPx,
  LM,
  median,
  nccMatch,
  patch,
  repTravel,
  summarize,
  toFace,
  type FaceFrame,
  type Gray,
  type Pt,
  type Sample,
  type Segment,
} from "@/lib/lab/scalp-measure";

type Stage = "intro" | "loading" | "align" | "place" | "still" | "move" | "result" | "error";

const PLACE_MS = 3500;
const STILL_MS = 1500;
const SLIDE_MS = 1600;
const SLIDES = 6; // forward, back, x3
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const TICKS = 72;

// Recording clock starts when "still" begins.
const SEGMENTS: Segment[] = Array.from({ length: SLIDES }, (_, i) => ({
  kind: i % 2 ? "back" : "fwd",
  start: STILL_MS + i * SLIDE_MS,
  end: STILL_MS + (i + 1) * SLIDE_MS,
}));
const REC_MS = STILL_MS + SLIDES * SLIDE_MS;

type Raw = { t: number; phase: "still" | "move"; ok: boolean; hv: number; mv: number; bv: number };
type Result = { travel: number; reps: number[]; spread: number; noise: number; quality: number; samples: Sample[] };

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

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const lmRef = useRef<FaceLandmarker | null>(null);
  const stageRef = useRef<Stage>("intro");
  const run = useRef({
    stageAt: 0,
    recAt: 0,
    steady: [] as Pt[],
    points: [] as { u: number; v: number }[],
    last: [] as { u: number; v: number }[],
    tpls: [] as (Gray | null)[],
    patchR: 10,
    pose0: null as { pitch: number; yaw: number } | null,
    iris: [] as number[],
    eye: [] as number[],
    raw: [] as Raw[],
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
    ctx.drawImage(v, 0, 0, W, H);
    const px = ctx.getImageData(x0, y0, w, h).data;
    const data = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) data[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    return { g: { data, w, h }, x0, y0 };
  }, []);

  const finish = useCallback(() => {
    const r = run.current;
    const still = r.raw.filter((x) => x.phase === "still" && x.ok);
    const eyeMm = median(r.eye) * (IRIS_MM / median(r.iris));
    const base = still.length ? { h: median(still.map((x) => x.hv)), m: median(still.map((x) => x.mv)), b: median(still.map((x) => x.bv)) } : { h: 0, m: 0, b: 0 };
    const samples: Sample[] = r.raw.map((x) => ({ t: x.t, phase: x.phase, ok: x.ok, hair: (x.hv - base.h) * eyeMm, mesh: (x.mv - base.m) * eyeMm, brow: (x.bv - base.b) * eyeMm }));
    const sum = summarize(samples);
    const reps = repTravel(samples, SEGMENTS);
    const res: Result = { travel: reps.mean, reps: reps.reps, spread: reps.spread, noise: sum.stillNoise, quality: sum.quality, samples };
    setResult(res);
    setLit(TICKS);
    setSaved("");
    const good = Number.isFinite(res.travel) && res.reps.length >= 2 && res.quality >= 0.6;
    if (good) say("Scalp movement", res.reps.map((x) => x.toFixed(1)).join("  ·  ") + " mm");
    else say("Couldn't get a clean reading", "Keep your fingertips behind your hairline and your face in the circle.");
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
    const ok = await fetch("/api/lab/scalp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: labKey,
        name,
        test: "push",
        phase,
        summary: { ...summarize(s), reps: result.reps, travel: result.travel, travelSpread: result.spread },
        trace: s.filter((_, i) => i % step === 0).map((x) => [Math.round(x.t), x.ok ? 1 : 0, x.hair, x.mesh, x.brow]),
        mm_per_px: IRIS_MM / median(r.iris),
        iris_px: median(r.iris),
        point: r.points[0] ?? null,
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
        if (!f || !pts) {
          r.steady = [];
          say("Position your face in the circle");
          return;
        }
        const off = Math.hypot(f.anchor.x - W / 2, f.anchor.y - H / 2) / D;
        const size = f.eyeDist / D;
        const top = fromFace(f, { u: 0, v: toFace(f, pts[LM.foreheadTop]).v + 0.4 });
        if (size < 0.07) say("Move a little closer");
        else if (size > 0.2 || top.y < 0) say("Move a little further back", "Your whole hairline needs to be in the circle.");
        else if (off > 0.12) say("Center your face in the circle");
        else {
          r.steady.push(f.anchor);
          if (r.steady.length > 18) r.steady.shift();
          const still = r.steady.length >= 18 && Math.max(...r.steady.map((p) => Math.hypot(p.x - f.anchor.x, p.y - f.anchor.y))) < D * 0.012;
          say("Hold the phone steady");
          if (still) {
            say("Put your fingertips on top of your head", "Behind your hairline, so the camera can still see it.");
            go("place");
          }
          return;
        }
        r.steady = [];
        return;
      }

      if (s === "place") {
        setLit(0);
        if (inStage >= PLACE_MS) {
          if (!f || !pts) {
            say("Position your face in the circle");
            go("align");
            return;
          }
          // Lock the spots on the hairline and take the skin templates.
          const vTop = toFace(f, pts[LM.foreheadTop]).v;
          r.points = [-0.3, 0, 0.3].map((u) => ({ u, v: vTop + 0.1 }));
          r.last = r.points.map((c) => ({ ...c }));
          r.patchR = Math.max(8, Math.min(16, Math.round(f.eyeDist * 0.09)));
          const centres = r.points.map((c) => fromFace(f, c));
          const pad = r.patchR + 2;
          const xs = centres.map((p) => p.x);
          const ys = centres.map((p) => p.y);
          const crop = grab(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad);
          r.tpls = centres.map((p) => (crop ? patch(crop.g, p.x - crop.x0, p.y - crop.y0, r.patchR) : null));
          r.pose0 = pose ? { pitch: pose.pitch, yaw: pose.yaw } : null;
          Object.assign(r, { raw: [], iris: [], eye: [], recAt: now });
          say("Hold still");
          go("still");
        }
        return;
      }

      // Recording: "still" then the guided slides.
      const t = now - r.recAt;
      if (s === "still" && t >= STILL_MS) go("move");
      if (t >= REC_MS) {
        finish();
        return;
      }
      if (t >= STILL_MS) {
        const i = Math.min(SLIDES - 1, Math.floor((t - STILL_MS) / SLIDE_MS));
        if (SEGMENTS[i].kind === "fwd") say("Slide your scalp forward", `${(i >> 1) + 1} of 3`);
        else say("Now slide it back", `${(i >> 1) + 1} of 3`);
        setLit(Math.round(((t - STILL_MS) / (REC_MS - STILL_MS)) * TICKS));
      }
      const phaseNow: Raw["phase"] = t < STILL_MS ? "still" : "move";
      if (!f || !pts) {
        r.raw.push({ t, phase: phaseNow, ok: false, hv: 0, mv: 0, bv: 0 });
        return;
      }
      const radius = Math.max(8, Math.round(r.patchR * 1.3));
      const preds = r.last.map((c) => fromFace(f, c));
      const pad = r.patchR + radius + 2;
      const xs = preds.map((p) => p.x);
      const ys = preds.map((p) => p.y);
      const crop = grab(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad);
      const vs: number[] = [];
      preds.forEach((p, i) => {
        const tpl = r.tpls[i];
        const hit = crop && tpl ? nccMatch(crop.g, tpl, p.x - crop.x0, p.y - crop.y0, radius) : null;
        const ok = !!hit && hit.score >= 0.55;
        const at = ok ? { x: hit!.x + crop!.x0, y: hit!.y + crop!.y0 } : p;
        if (ok) {
          r.last[i] = toFace(f, at);
          vs.push(r.last[i].v);
        }
        // Small glowing dot on each tracked spot.
        ctx.fillStyle = ok ? "rgba(48,209,88,0.95)" : "rgba(255,255,255,0.35)";
        ctx.shadowColor = ok ? "rgba(48,209,88,0.9)" : "transparent";
        ctx.shadowBlur = D * 0.02;
        ctx.beginPath();
        ctx.arc(at.x, at.y, D * 0.008, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
      const poseOk = !r.pose0 || !pose || (Math.abs(pose.pitch - r.pose0.pitch) < 6 && Math.abs(pose.yaw - r.pose0.yaw) < 8);
      const ok = vs.length >= 2 && poseOk;
      r.raw.push({
        t,
        phase: phaseNow,
        ok,
        hv: vs.length ? median(vs) : 0,
        mv: toFace(f, pts[LM.foreheadTop]).v,
        bv: (toFace(f, pts[LM.browR]).v + toFace(f, pts[LM.browL]).v) / 2,
      });
      if (phaseNow === "still") {
        r.iris.push(irisDiameterPx(pts));
        r.eye.push(f.eyeDist);
      }
      if (!poseOk) setSub("Keep your head still. Only your scalp moves.");
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

  const good = !!result && Number.isFinite(result.travel) && result.reps.length >= 2 && result.quality >= 0.6;
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
  savedTxt: { textAlign: "center", color: "#30D158", fontSize: 17, margin: "4px 0" },
};
