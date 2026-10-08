// KESHAH Creators app: public config read on launch (no auth).
// GET -> { min_version, app_store_url?, support_email, support_url, apply_url }
// min_version: Settings/mobile.min_version (raise it to force everyone onto a new build),
// else env MOBILE_MIN_VERSION, else 1.0.0.
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { mobileSettings } from "@/lib/mobile/demo";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await mobileSettings(getFirebaseAdmin().db).catch(() => ({}) as { min_version?: string; app_store_url?: string });
  return Response.json({
    min_version: s.min_version || process.env.MOBILE_MIN_VERSION?.trim() || "1.0.0",
    ...(s.app_store_url ? { app_store_url: s.app_store_url } : {}),
    support_email: "contact@keshah.com",
    support_url: "https://www.keshah.com/support",
    apply_url: "https://www.keshah.com/careers/paid-creator-intern/apply",
  });
}
