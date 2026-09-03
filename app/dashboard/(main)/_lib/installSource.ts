// Shared install-source filter primitives.
//
// Backed by the `install_source` field on Users, populated by the RC →
// Firestore backfill cron at /api/rc/backfill-attribution. Derived
// binarily from Appstack's mediaSource attribute in RC:
//   paid    → mediaSource matches a known ad network (meta, google,
//             tiktok, etc.)
//   organic → everything else — no mediaSource at all (App Store
//             search / direct install / referral), or a mediaSource
//             we don't recognize as paid. Silent view-through ads
//             where ATT was denied can slip in here; that's the same
//             blind spot every attribution tool has.

export type InstallSourceFilter = "all" | "paid" | "organic";

export function parseInstallSourceFilter(raw: string | undefined): InstallSourceFilter {
  if (raw === "paid" || raw === "organic") return raw;
  return "all";
}

// Match a user doc against the filter. `organic` catches BOTH the
// explicit "organic" label AND missing / legacy "unknown" values —
// so pre-fix data automatically rolls into the organic bucket.
export function matchesInstallSource(
  filter: InstallSourceFilter,
  d: Record<string, unknown>,
): boolean {
  if (filter === "all") return true;
  const raw = d.install_source as string | undefined;
  if (filter === "paid") return raw === "paid";
  // organic: anything that isn't explicitly paid
  return raw !== "paid";
}
