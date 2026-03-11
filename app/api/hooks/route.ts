import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

// GET — list all hooks
export async function GET() {
  const { db } = getFirebaseAdmin();
  const snap = await db.collection("Hooks").where("is_active", "==", true).get();

  const hooks = snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    created_at: doc.data().created_at?.toDate?.()?.toISOString() || null,
  }));

  hooks.sort((a, b) => ((b.created_at as string) || "").localeCompare((a.created_at as string) || ""));

  return NextResponse.json(hooks);
}

// POST — add a hook (admin only)
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await getPayloadFromToken(token);
  if (payload?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json();

  // Support bulk import
  const hooks = Array.isArray(body) ? body : [body];

  const { db } = getFirebaseAdmin();
  const results = [];

  for (const hook of hooks) {
    const { title, category, talking_points, core_message, reference_video_url, views } = hook;

    if (!title || !category) {
      continue;
    }

    const hookData = {
      title,
      category,
      talking_points: talking_points || [],
      core_message: core_message || "",
      reference_video_url: reference_video_url || "",
      views: views || 0,
      is_active: true,
      created_at: FieldValue.serverTimestamp(),
    };

    const ref = await db.collection("Hooks").add(hookData);
    results.push({ id: ref.id, ...hookData });
  }

  return NextResponse.json(results);
}

// PUT — update a hook (admin only)
export async function PUT(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await getPayloadFromToken(token);
  if (payload?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "Hook ID required" }, { status: 400 });

  const { db } = getFirebaseAdmin();
  await db.collection("Hooks").doc(id).update(updates);

  return NextResponse.json({ ok: true });
}

// DELETE — deactivate a hook (admin only)
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await getPayloadFromToken(token);
  if (payload?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Hook ID required" }, { status: 400 });

  const { db } = getFirebaseAdmin();
  await db.collection("Hooks").doc(id).update({ is_active: false });

  return NextResponse.json({ ok: true });
}
