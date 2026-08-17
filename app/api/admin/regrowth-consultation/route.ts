// Admin API for the regrowth consultation capacity toggle.
//
// When enabled, the app's Regrowth-tab "See if you qualify" CTA is
// disabled with a "we're currently at capacity" message. Team throttle
// — flip on when the schedule is full so we don't overbook Aadi.
//
// GET  → returns current capacity flag
// POST → writes new value back
//
// Admin-only (JWT role check).

import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";

const SETTINGS_DOC = "Settings/app_general_settings";
const F = {
  capacity: "regrowth_consultation_capacity_reached",
};

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await getPayloadFromToken(token);
  if (!payload || payload.role !== "admin") return null;
  return payload;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { db } = getFirebaseAdmin();
  const snap = await db.doc(SETTINGS_DOC).get();
  const data = snap.data() || {};

  return NextResponse.json({
    capacityReached: data[F.capacity] === true,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const capacityReached = body.capacityReached === true;

  const { db } = getFirebaseAdmin();
  await db.doc(SETTINGS_DOC).set(
    { [F.capacity]: capacityReached },
    { merge: true }
  );

  return NextResponse.json({ ok: true, capacityReached });
}
