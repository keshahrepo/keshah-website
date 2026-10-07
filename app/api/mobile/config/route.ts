// KESHAH Creators app: public config read on launch (no auth).
// GET -> { min_version, support_email, apply_url }

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    min_version: process.env.MOBILE_MIN_VERSION?.trim() || "1.0.0",
    support_email: "contact@keshah.com",
    apply_url: "https://www.keshah.com/careers/paid-creator-intern/apply",
  });
}
