// POST /api/lab/scalp
//
// Saves one scalp mobility measurement from /lab/scalp (1-week feasibility
// test). No video or images are sent, only the numbers and a downsampled
// trace, written to LabScalpTests for analysis.

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { LAB_KEY } from "@/lib/lab/key";

export const runtime = "nodejs";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  if (b.key !== LAB_KEY) return NextResponse.json({ ok: false }, { status: 403 });
  const name = str(b.name, 60);
  const test = b.test === "push" || b.test === "brow" ? b.test : null;
  if (!name || !test) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });

  const s = (b.summary ?? {}) as Record<string, unknown>;
  const trace = Array.isArray(b.trace) ? b.trace.slice(0, 600) : [];
  const ref = getFirebaseAdmin().db.collection("LabScalpTests").doc();
  await ref.set({
    name,
    test,
    phase: str(b.phase, 20),
    rep: num(b.rep),
    ruler_mm: num(b.ruler_mm),
    pinch: str(b.pinch, 30),
    note: str(b.note, 200),
    summary: {
      hair_range_mm: num(s.hairRange),
      mesh_range_mm: num(s.meshRange),
      brow_range_mm: num(s.browRange),
      still_noise_mm: num(s.stillNoise),
      quality: num(s.quality),
      frames: num(s.frames),
    },
    mm_per_px: num(b.mm_per_px),
    iris_px: num(b.iris_px),
    point: b.point && typeof b.point === "object" ? b.point : null,
    trace: trace.map((r) => (Array.isArray(r) ? r.slice(0, 5).map(num) : null)).filter(Boolean).map((r) => ({ t: r![0], ok: r![1], hair: r![2], mesh: r![3], brow: r![4] })),
    device: { ua: str(req.headers.get("user-agent"), 300), w: num(b.video_w), h: num(b.video_h) },
    created_at: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true, id: ref.id });
}
