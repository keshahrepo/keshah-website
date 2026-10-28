// Forced updates for the KESHAH Creators app, automatic per build.
//
// The release script (keshah-creators-app tool/release.sh) bumps the build and
// sets Settings/mobile.pending_min_version ("1.0.0+19"). Nothing is forced yet:
// Apple may still be reviewing it for the public TestFlight link. The first time
// a real creator (role creator, not staff, not the App Review demo account)
// calls the API from that build or newer, the build is provably out, so it
// becomes min_version and every older app shows "Update required".
// The app sends its build on every request as X-App-Version (from build 18).
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { MobileClaims } from "./token";

/** -1 / 0 / 1 for "1.2.10+7" vs "1.3", like the app: dotted parts first, then the build after "+". */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split("+")[0].split(".").map((x) => parseInt(x.trim(), 10) || 0);
  const build = (v: string) => (v.includes("+") ? parseInt(v.split("+")[1], 10) || 0 : 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  const d = build(a) - build(b);
  return d === 0 ? 0 : d < 0 ? -1 : 1;
}

/** "1.0.0+19", or null for anything that isn't a version. */
export function appVersionFrom(headers: Headers): string | null {
  const v = headers.get("x-app-version")?.trim() ?? "";
  return /^\d+(\.\d+){0,3}(\+\d+)?$/.test(v) ? v : null;
}

/** Whether this caller proves the pending build is out to creators. */
export function provesRelease(p: { pending?: string; version: string | null; claims: MobileClaims | null; staff: boolean }): boolean {
  if (!p.pending || !p.version || !p.claims) return false;
  if (p.claims.role !== "creator" || p.claims.amr === "demo" || p.staff) return false;
  // Test accounts (aaditya.agrawal36+test2@...) run local builds before they're on TestFlight.
  if (/\+test/i.test(String(p.claims.sub ?? "").split("@")[0])) return false;
  return compareVersions(p.version, p.pending) >= 0;
}

/**
 * Promotes Settings/mobile.pending_min_version to min_version (never lowering
 * it). Returns the version that became required, or null. Transactional, so
 * two creators opening it at once promote it once.
 */
export async function promotePendingMinVersion(db: Firestore, version: string, by: string): Promise<string | null> {
  const ref = db.collection("Settings").doc("mobile");
  return db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() ?? {};
    const pending = typeof d.pending_min_version === "string" ? d.pending_min_version.trim() : "";
    if (!pending || compareVersions(version, pending) < 0) return null;
    const current = typeof d.min_version === "string" ? d.min_version.trim() : "";
    const next = current && compareVersions(current, pending) > 0 ? current : pending;
    tx.update(ref, {
      min_version: next,
      pending_min_version: FieldValue.delete(),
      min_version_set_at: FieldValue.serverTimestamp(),
      min_version_set_by: by,
    });
    return next === pending ? pending : null;
  });
}
