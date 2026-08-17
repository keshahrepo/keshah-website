// Admin API for the microneedling masterclass toggle.
//
// GET  → returns current masterclass fields from Settings/app_general_settings
// POST → writes new values back to the same doc (merge)
//
// Field shape matches what the Flutter app reads (see AppSettingsModel +
// AppConsts.microneedlingMasterclass*):
//   microneedling_masterclass_enabled          : bool
//   microneedling_masterclass_calendly_url     : string
//   microneedling_masterclass_available_until  : Timestamp
//
// Admin-only (JWT role check).

import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";
import { Timestamp } from "firebase-admin/firestore";

const SETTINGS_DOC = "Settings/app_general_settings";
const F = {
  enabled: "microneedling_masterclass_enabled",
  calendlyUrl: "microneedling_masterclass_calendly_url",
  meetUrl: "microneedling_masterclass_meet_url",
  availableUntil: "microneedling_masterclass_available_until",
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

  const availableUntilRaw = data[F.availableUntil];
  let availableUntilIso: string | null = null;
  if (availableUntilRaw?.toDate) {
    availableUntilIso = availableUntilRaw.toDate().toISOString();
  } else if (typeof availableUntilRaw === "string") {
    availableUntilIso = availableUntilRaw;
  }

  return NextResponse.json({
    enabled: data[F.enabled] === true,
    calendlyUrl: (data[F.calendlyUrl] as string | null) || "",
    meetUrl: (data[F.meetUrl] as string | null) || "",
    availableUntilIso,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const enabled = body.enabled === true;
  const calendlyUrl = typeof body.calendlyUrl === "string" ? body.calendlyUrl.trim() : "";
  const meetUrl = typeof body.meetUrl === "string" ? body.meetUrl.trim() : "";
  const availableUntilIso =
    typeof body.availableUntilIso === "string" ? body.availableUntilIso.trim() : "";

  // Validate — if enabling, both URL and deadline must be set.
  if (enabled) {
    if (!calendlyUrl.startsWith("https://")) {
      return NextResponse.json(
        { error: "Calendly URL must start with https://" },
        { status: 400 }
      );
    }
    if (meetUrl && !meetUrl.startsWith("https://")) {
      return NextResponse.json(
        { error: "Meeting URL must start with https:// if provided" },
        { status: 400 }
      );
    }
    if (!availableUntilIso) {
      return NextResponse.json(
        { error: "Deadline is required when enabling the masterclass" },
        { status: 400 }
      );
    }
    const parsed = new Date(availableUntilIso);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Deadline is not a valid date" },
        { status: 400 }
      );
    }
    if (parsed.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Deadline is in the past" },
        { status: 400 }
      );
    }
  }

  const { db } = getFirebaseAdmin();
  const updates: Record<string, unknown> = {
    [F.enabled]: enabled,
    [F.calendlyUrl]: calendlyUrl || null,
    [F.meetUrl]: meetUrl || null,
    [F.availableUntil]: availableUntilIso
      ? Timestamp.fromDate(new Date(availableUntilIso))
      : null,
  };
  await db.doc(SETTINGS_DOC).set(updates, { merge: true });

  return NextResponse.json({ ok: true, ...updates, [F.availableUntil]: availableUntilIso || null });
}
