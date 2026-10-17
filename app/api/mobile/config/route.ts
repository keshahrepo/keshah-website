// KESHAH Creators app: public config read on launch (no auth).
// GET -> { min_version, app_store_url?, support_email, support_url, apply_url }
// min_version: Settings/mobile.min_version (raise it to force everyone onto a new build),
// else env MOBILE_MIN_VERSION, else 1.0.0. It may name a build ("1.0.0+5"): the app
// compares its build number too, so a forced update can target one TestFlight build.
// Each new build is forced automatically: see lib/mobile/release.ts.
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { mobileSettings } from "@/lib/mobile/demo";
import { appVersionFrom, promotePendingMinVersion, provesRelease } from "@/lib/mobile/release";
import { bearerToken, verifyMobileToken } from "@/lib/mobile/token";
import { isStaffEmail, notifyFounder } from "@/lib/staff";

export const dynamic = "force-dynamic";

/** A creator on the pending build proves it's out: it becomes the minimum. Never throws. */
async function promoteIfReleased(req: Request, pending: string | undefined): Promise<string | null> {
  try {
    const version = appVersionFrom(req.headers);
    const token = bearerToken(req.headers);
    if (!pending || !version || !token) return null;
    const claims = await verifyMobileToken(token);
    const staff = claims ? await isStaffEmail(claims.sub) : false;
    if (!provesRelease({ pending, version, claims, staff })) return null;
    const promoted = await promotePendingMinVersion(getFirebaseAdmin().db, version, claims!.sub);
    if (promoted) {
      const build = promoted.split("+")[1] ?? promoted;
      await notifyFounder({ title: `Build ${build} is now required`, body: "A creator opened it, so everyone on an older build now sees Update required." });
    }
    return promoted;
  } catch (e) {
    console.error("min_version promote failed:", e);
    return null;
  }
}

export async function GET(req: Request) {
  const s = await mobileSettings(getFirebaseAdmin().db).catch(() => ({}) as { min_version?: string; app_store_url?: string; pending_min_version?: string });
  const promoted = await promoteIfReleased(req, s.pending_min_version);
  if (promoted) s.min_version = promoted;
  return Response.json({
    min_version: s.min_version || process.env.MOBILE_MIN_VERSION?.trim() || "1.0.0",
    ...(s.app_store_url ? { app_store_url: s.app_store_url } : {}),
    support_email: "contact@keshah.com",
    support_url: "https://www.keshah.com/support",
    apply_url: "https://www.keshah.com/careers/paid-creator-intern/apply",
  });
}
