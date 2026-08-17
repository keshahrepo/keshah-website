// Admin API for the post-purchase onboarding-call prompt toggle.
//
// GET  → returns current onboarding-call fields from Settings/app_general_settings
// POST → writes new values back to the same doc (merge)
//
// Field shape matches what the Flutter app reads (see AppSettingsModel +
// AppConsts.onboardingCallPostPurchase*):
//   onboarding_call_post_purchase_enabled       : bool
//   onboarding_call_post_purchase_calendly_url  : string
//
// Admin-only (JWT role check).

import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";

const SETTINGS_DOC = "Settings/app_general_settings";
const F = {
  enabled: "onboarding_call_post_purchase_enabled",
  calendlyUrl: "onboarding_call_post_purchase_calendly_url",
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
    enabled: data[F.enabled] === true,
    calendlyUrl: (data[F.calendlyUrl] as string | null) || "",
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const enabled = body.enabled === true;
  const calendlyUrl =
    typeof body.calendlyUrl === "string" ? body.calendlyUrl.trim() : "";

  // If enabling, URL is required so the app doesn't ship a broken CTA.
  if (enabled) {
    if (!calendlyUrl.startsWith("https://")) {
      return NextResponse.json(
        { error: "Calendly URL must start with https://" },
        { status: 400 }
      );
    }
  }

  const { db } = getFirebaseAdmin();
  const updates: Record<string, unknown> = {
    [F.enabled]: enabled,
    [F.calendlyUrl]: calendlyUrl || null,
  };
  await db.doc(SETTINGS_DOC).set(updates, { merge: true });

  return NextResponse.json({ ok: true, ...updates });
}
