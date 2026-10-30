// POST { pct: 20|40|60|80|95, why? }: the founder's guess that this creator passes
// their trial. Any time before their first posting day; it can't change after that
// (lib/founder/predictions.ts).
import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/creators/admin";
import { CREATORS_COLLECTION, getCreator, hasStarted } from "@/lib/creators/db";
import { parsePrediction } from "@/lib/founder/predictions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const creator = await getCreator(id);
  if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (hasStarted(creator)) return NextResponse.json({ error: "They've already started posting, so the prediction is locked." }, { status: 409 });
  const p = parsePrediction(await req.json().catch(() => ({})), new Date().toISOString());
  if ("error" in p) return NextResponse.json({ error: p.error }, { status: 400 });
  await getFirebaseAdmin().db.collection(CREATORS_COLLECTION).doc(id).set({ hire_prediction: p }, { merge: true });
  return NextResponse.json({ hire_prediction: p });
}
