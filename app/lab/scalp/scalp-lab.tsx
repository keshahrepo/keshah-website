"use client";

// Scalp mobility lab (hidden, 1-week feasibility test). The front camera
// follows a patch of skin at the hairline while the tester pushes their scalp
// or raises their eyebrows, and reports how far it moved in millimetres.
// Math lives in lib/lab/scalp-measure.ts. Nothing visual leaves the phone;
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
  summarize,
  toFace,
  type FaceFrame,
  type Gray,
  type Pt,
  type Sample,
  type Summary,
} from "@/lib/lab/scalp-measure";

type Test = "push" | "brow";
type Stage = "setup" | "loading" | "aim" | "still" | "move" | "result" | "error";

const STILL_MS = 2500;
const MOVE_MS = 9000;
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";

const INSTRUCTIONS: Record<Test, string> = {
  push: "Fingertips on top of your head, behind the hairline. Slowly slide your scalp forward and back, 3 times. Keep your hand above the circles.",
  brow: "Raise your eyebrows as high as you can, then relax. 3 times, slowly.",
};

type Raw = { t: number; phase: "still" | "move"; ok: boolean; hv: number; mv: number; bv: number };
type Rep = { test: Test; summary: Summary; saved: boolean | null };

export default function ScalpLab({ labKey }: { labKey: string }) {
  const [stage, setStage] = useState<Stage>("setup");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [test, setTest] = useState<Test>("brow");
  const [phase, setPhase] = useState("before");
  const [pinch, setPinch] = useState("");
  const [ruler, setRuler] = useState("");
  const [note, setNote] = useState("");
  const [hint, setHint] = useState("");
  const [progress, setProgress] = useState(0);
  const [live, setLive] = useState<number | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const lmRef = useRef<FaceLandmarker | null>(null);
  const stageRef = useRef<Stage>("setup");
  const run = useRef({
    points: [] as { u: number; v: number }[], // tracked spots, face coords
    last: [] as { u: number; v: number }[],
    tpls: [] as (Gray | null)[],
    patchR: 10,
    startAt: 0,
    pose0: null as { pitch: number; yaw: number } | null,
    iris: [] as number[],
    eye: [] as number[],
    raw: [] as Raw[],
    eyeMm: 0,
    base: { h: 0, m: 0, b: 0 },
    lastFrame: null as FaceFrame | null,
  });

  useEffect(() => {
    try {
      setName(localStorage.getItem("lab_name") ?? "");
    } catch {}
  }, []);

  const go = (s: Stage) => {
    stageRef.current = s;
    setStage(s);
  };

  // Grab a grayscale crop of the current video frame.
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
    const eyeMm = r.eyeMm;
    const samples: Sample[] = r.raw.map((x) => ({
      t: x.t,
      phase: x.phase,
      ok: x.ok,
      hair: (x.hv - r.base.h) * eyeMm,
      mesh: (x.mv - r.base.m) * eyeMm,
      brow: (x.bv - r.base.b) * eyeMm,
    }));
    const summary = summarize(samples);
    const rep: Rep = { test, summary, saved: null };
    const idx = reps.length;
    setReps((p) => [...p, rep]);
    go("result");
    const step = Math.max(1, Math.ceil(samples.length / 400));
    const trace = samples.filter((_, i) => i % step === 0).map((s) => [Math.round(s.t), s.ok ? 1 : 0, s.hair, s.mesh, s.brow]);
    const mmPerPx = IRIS_MM / median(r.iris);
    fetch("/api/lab/scalp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: labKey,
        name,
        test,
        phase,
        pinch,
        note,
        rep: reps.filter((x) => x.test === test).length + 1,
        ruler_mm: ruler ? Number(ruler) : null,
        summary,
        trace,
        mm_per_px: mmPerPx,
        iris_px: median(r.iris),
        point: r.points[0] ?? null,
        video_w: videoRef.current?.videoWidth,
        video_h: videoRef.current?.videoHeight,
      }),
    })
      .then((res) => setReps((p) => p.map((x, i) => (i === idx ? { ...x, saved: res.ok } : x))))
      .catch(() => setReps((p) => p.map((x, i) => (i === idx ? { ...x, saved: false } : x))));
  }, [labKey, name, test, phase, pinch, note, ruler, reps]);

  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Per-frame loop: face mesh, tracking, drawing.
  const loop = useCallback(() => {
    const v = videoRef.current;
    const lm = lmRef.current;
    const cv = overlayRef.current;
    if (!v || !lm || !cv) return;
    let lastT = -1;
    const tick = () => {
      const s = stageRef.current;
      if (s === "setup" || s === "error" || s === "result") return;
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
      const res = lm.detectForVideo(v, now);
      const r = run.current;
      const face = res.faceLandmarks?.[0];
      const rec = s === "still" || s === "move";
      const t = now - r.startAt;
      if (s === "still" && t >= STILL_MS) {
        // Lock in scale and resting position from the still phase.
        const still = r.raw.filter((x) => x.phase === "still" && x.ok);
        if (still.length < 10 || !r.iris.length) {
          setHint("Couldn't see you clearly while still. Better light, phone steady, try again.");
          go("aim");
          return;
        }
        r.eyeMm = median(r.eye) * (IRIS_MM / median(r.iris));
        r.base = { h: median(still.map((x) => x.hv)), m: median(still.map((x) => x.mv)), b: median(still.map((x) => x.bv)) };
        go("move");
      } else if (s === "move" && t >= STILL_MS + MOVE_MS) {
        finishRef.current();
        return;
      }
      if (rec) setProgress(Math.min(1, t / (STILL_MS + MOVE_MS)));

      if (!face) {
        setHint("Can't find your face. Hold the phone at arm's length, face the camera.");
        if (rec) r.raw.push({ t, phase: stageRef.current === "move" ? "move" : "still", ok: false, hv: 0, mv: 0, bv: 0 });
        return;
      }
      const pts: Pt[] = face.map((p) => ({ x: p.x * W, y: p.y * H }));
      const f = faceFrame(pts);
      r.lastFrame = f;
      const m = res.facialTransformationMatrixes?.[0]?.data;
      const pose = m ? headAngles(m) : null;

      // Draw: iris, anchor, up axis.
      ctx.lineWidth = Math.max(2, W / 400);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(f.anchor.x, f.anchor.y);
      const top = fromFace(f, { u: 0, v: 2.6 });
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
      ctx.fillStyle = "#4ADE80";
      ctx.beginPath();
      ctx.arc(f.anchor.x, f.anchor.y, ctx.lineWidth * 2, 0, Math.PI * 2);
      ctx.fill();

      if (s === "aim") {
        setHint(r.points.length ? "Got it. Tap Start when ready, or tap again to move the spot." : "Tap your hairline in the middle (or the dot you drew).");
        for (const c of r.points) {
          const p = fromFace(f, c);
          ctx.strokeStyle = "#FBBF24";
          ctx.beginPath();
          ctx.arc(p.x, p.y, r.patchR * 1.4, 0, Math.PI * 2);
          ctx.stroke();
        }
        return;
      }
      if (!rec) return;

      // First recording frame: take the skin templates.
      if (!r.tpls.length) {
        r.patchR = Math.max(8, Math.min(16, Math.round(f.eyeDist * 0.09)));
        const centres = r.points.map((c) => fromFace(f, c));
        const pad = r.patchR + 2;
        const xs = centres.map((p) => p.x);
        const ys = centres.map((p) => p.y);
        const crop = grab(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad);
        r.tpls = centres.map((p) => (crop ? patch(crop.g, p.x - crop.x0, p.y - crop.y0, r.patchR) : null));
        r.last = r.points.map((c) => ({ ...c }));
        r.pose0 = pose ? { pitch: pose.pitch, yaw: pose.yaw } : null;
      }

      // Track each spot near where it was last frame.
      const radius = Math.max(8, Math.round(r.patchR * 1.2));
      const preds = r.last.map((c) => fromFace(f, c));
      const pad = r.patchR + radius + 2;
      const xs = preds.map((p) => p.x);
      const ys = preds.map((p) => p.y);
      const crop = grab(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad);
      const vs: number[] = [];
      let good = 0;
      preds.forEach((p, i) => {
        const tpl = r.tpls[i];
        const hit = crop && tpl ? nccMatch(crop.g, tpl, p.x - crop.x0, p.y - crop.y0, radius) : null;
        const ok = !!hit && hit.score >= 0.55;
        const at = hit ? { x: hit.x + crop!.x0, y: hit.y + crop!.y0 } : p;
        if (ok) {
          good++;
          r.last[i] = toFace(f, at);
          vs.push(r.last[i].v);
        }
        ctx.strokeStyle = ok ? "#4ADE80" : "#F87171";
        ctx.strokeRect(at.x - r.patchR, at.y - r.patchR, r.patchR * 2, r.patchR * 2);
      });
      const poseOk = !r.pose0 || !pose || (Math.abs(pose.pitch - r.pose0.pitch) < 6 && Math.abs(pose.yaw - r.pose0.yaw) < 8);
      const ok = good >= Math.min(2, r.points.length) && poseOk;
      const browV = (toFace(f, pts[LM.browR]).v + toFace(f, pts[LM.browL]).v) / 2;
      const row: Raw = { t, phase: stageRef.current === "move" ? "move" : "still", ok, hv: vs.length ? median(vs) : 0, mv: toFace(f, pts[LM.foreheadTop]).v, bv: browV };
      r.raw.push(row);
      if (row.phase === "still") {
        r.iris.push(irisDiameterPx(pts));
        r.eye.push(f.eyeDist);
        setHint("Hold completely still…");
        setLive(null);
      } else {
        setHint(!poseOk ? "Keep your head still, just move the scalp." : ok ? INSTRUCTIONS[test] : "Lost the spot. Keep your hand out of the boxes.");
        setLive(ok ? (row.hv - r.base.h) * r.eyeMm : null);
      }
    };
    requestAnimationFrame(tick);
  }, [grab, test]);

  const startCamera = async () => {
    if (!name.trim()) {
      setError("Add your name first.");
      return;
    }
    setError("");
    try {
      localStorage.setItem("lab_name", name.trim());
    } catch {}
    go("loading");
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
      run.current.points = [];
      go("aim");
      loop();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      go("error");
    }
  };

  const onTap = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stageRef.current !== "aim") return;
    const v = videoRef.current;
    const f = run.current.lastFrame;
    if (!v || !f) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // The preview is mirrored, so flip x back.
    const x = ((rect.right - e.clientX) / rect.width) * v.videoWidth;
    const y = ((e.clientY - rect.top) / rect.height) * v.videoHeight;
    const c = toFace(f, { x, y });
    run.current.points = [c, { u: c.u - 0.28, v: c.v }, { u: c.u + 0.28, v: c.v }];
  };

  const record = () => {
    const r = run.current;
    if (!r.points.length) return;
    Object.assign(r, { tpls: [], raw: [], iris: [], eye: [], pose0: null, startAt: performance.now() });
    setProgress(0);
    go("still");
  };

  const again = () => {
    go("aim");
    loop();
  };

  const mine = reps.filter((r) => r.test === test).map((r) => r.summary.hairRange).filter((x) => Number.isFinite(x));
  const spread = mine.length > 1 ? Math.max(...mine) - Math.min(...mine) : null;
  const last = reps[reps.length - 1];

  return (
    <main style={S.main}>
      <h1 style={S.h1}>Scalp mobility lab</h1>
      {stage === "setup" || stage === "error" ? (
        <section style={S.card}>
          <p style={S.sub}>Test version. Phone at arm&apos;s length (or propped up), good light from the front, hair off your forehead.</p>
          <label style={S.label}>Your name</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Noah" />
          <label style={S.label}>Test</label>
          <Seg value={test} onChange={(v) => setTest(v as Test)} options={[["brow", "Eyebrow raise"], ["push", "Scalp push"]]} />
          <label style={S.label}>When</label>
          <Seg value={phase} onChange={setPhase} options={[["before", "Before a session"], ["after", "Right after a session"], ["other", "Other"]]} />
          <label style={S.label}>Pinch test: where you&apos;re thinning vs. not</label>
          <Seg value={pinch} onChange={setPinch} options={[["much", "Much tighter"], ["bit", "A bit tighter"], ["same", "About the same"], ["none", "Not thinning"]]} />
          <label style={S.label}>Ruler reading, mm (optional)</label>
          <input style={S.input} inputMode="decimal" value={ruler} onChange={(e) => setRuler(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Only if you measured with a ruler" />
          <label style={S.label}>Note (optional)</label>
          <input style={S.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. drew a dot at hairline" />
          {error && <p style={S.err}>{error}</p>}
          <button style={S.btn} onClick={startCamera}>Open camera</button>
        </section>
      ) : null}

      <div style={{ ...S.stageBox, display: stage === "setup" || stage === "error" ? "none" : "block" }} onPointerDown={onTap}>
        <video ref={videoRef} playsInline muted style={S.video} />
        <canvas ref={overlayRef} style={S.overlay} />
        {(stage === "still" || stage === "move") && <div style={{ ...S.bar, width: `${progress * 100}%` }} />}
      </div>

      {stage === "loading" && <p style={S.sub}>Loading the face tracker…</p>}
      {(stage === "aim" || stage === "still" || stage === "move") && (
        <section style={S.card}>
          <p style={S.hint}>{hint}</p>
          {stage === "move" && <p style={S.big}>{live == null ? "–" : `${live >= 0 ? "+" : ""}${live.toFixed(1)} mm`}</p>}
          {stage === "aim" && (
            <>
              <p style={S.sub}>{test === "brow" ? INSTRUCTIONS.brow : INSTRUCTIONS.push}</p>
              <button style={{ ...S.btn, opacity: run.current.points.length ? 1 : 0.4 }} onClick={record}>
                Start ({(STILL_MS + MOVE_MS) / 1000}s)
              </button>
              <button style={S.ghost} onClick={() => go("setup")}>Change details</button>
            </>
          )}
        </section>
      )}

      {stage === "result" && last && (
        <section style={S.card}>
          <p style={S.label}>Hairline moved</p>
          <p style={S.big}>{fmt(last.summary.hairRange)}</p>
          <p style={S.sub}>
            Noise while still {fmt(last.summary.stillNoise)} · frames counted {Math.round(last.summary.quality * 100)}% · mesh {fmt(last.summary.meshRange)}
            {last.test === "brow" ? ` · eyebrows ${fmt(last.summary.browRange)}` : ""}
          </p>
          {last.summary.quality < 0.6 && <p style={S.err}>Too many frames lost. Redo this one.</p>}
          <p style={S.sub}>{last.saved == null ? "Saving…" : last.saved ? "Saved." : "Didn't save. Check your connection."}</p>
          {mine.length > 0 && (
            <p style={S.sub}>
              {test === "brow" ? "Eyebrow" : "Push"} tries so far: {mine.map((x) => x.toFixed(1)).join(", ")} mm
              {spread != null ? ` (spread ${spread.toFixed(1)} mm)` : ""}
            </p>
          )}
          <p style={S.sub}>{mine.length < 3 ? `Do ${3 - mine.length} more without moving the phone.` : "3 done. Switch test, or change “When” after a session."}</p>
          <button style={S.btn} onClick={again}>Again</button>
          <button style={S.ghost} onClick={() => go("setup")}>Change details</button>
        </section>
      )}
    </main>
  );
}

const fmt = (x: number) => (Number.isFinite(x) ? `${x.toFixed(1)} mm` : "–");

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div style={S.seg}>
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)} style={{ ...S.segBtn, ...(value === v ? S.segOn : null) }}>
          {l}
        </button>
      ))}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", background: "#0B0B0C", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", padding: "16px 16px 40px", maxWidth: 560, margin: "0 auto" },
  h1: { fontSize: 20, fontWeight: 700, margin: "4px 0 12px" },
  card: { background: "#18181B", borderRadius: 16, padding: 16, marginTop: 12, display: "flex", flexDirection: "column", gap: 8 },
  label: { fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 6 },
  sub: { fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,0.6)", margin: 0 },
  hint: { fontSize: 15, lineHeight: 1.4, margin: 0 },
  big: { fontSize: 36, fontWeight: 700, margin: "2px 0", letterSpacing: -1 },
  err: { fontSize: 13, color: "#F87171", margin: 0 },
  input: { background: "#0B0B0C", border: "1px solid #3F3F46", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 16 },
  btn: { background: "#4ADE80", color: "#000", border: 0, borderRadius: 12, padding: "14px 16px", fontSize: 16, fontWeight: 600, marginTop: 8 },
  ghost: { background: "transparent", color: "rgba(255,255,255,0.7)", border: "1px solid #3F3F46", borderRadius: 12, padding: "12px 16px", fontSize: 15 },
  seg: { display: "flex", flexWrap: "wrap", gap: 6 },
  segBtn: { background: "#0B0B0C", color: "rgba(255,255,255,0.75)", border: "1px solid #3F3F46", borderRadius: 999, padding: "8px 12px", fontSize: 14 },
  segOn: { background: "#fff", color: "#000", borderColor: "#fff" },
  stageBox: { position: "relative", width: "100%", borderRadius: 16, overflow: "hidden", background: "#000", touchAction: "manipulation" },
  video: { width: "100%", display: "block", transform: "scaleX(-1)" },
  overlay: { position: "absolute", inset: 0, width: "100%", height: "100%", transform: "scaleX(-1)", pointerEvents: "none" },
  bar: { position: "absolute", left: 0, bottom: 0, height: 4, background: "#4ADE80" },
};
