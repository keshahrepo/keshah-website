// Shared campaign / influencer filter primitives.
//
// Backed by the `attribution_campaign` field on Users, populated by the
// RC → Firestore backfill from Appstack's `$campaign` subscriber
// attribute. Each Appstack campaign gets its own value (e.g. "Isai",
// "App-centric ads"). We treat this as an "influencer filter" in the UI
// since our current non-Meta campaigns are all influencer creators, but
// the underlying data is generic — any future campaign auto-appears.

export type CampaignFilter = "all" | string;

// Group platform-specific creator campaigns into one bucket per creator.
// "Isai TikTok", "Isai Insta", "Isai" all land in a single "Isai" tab
// so the dashboard reads creator-first (who is producing installs?)
// rather than platform-first. Add a new creator here as they onboard —
// the platform breakdown is still preserved in the raw
// `attribution_campaign` field for anyone who needs to drill in.
const CREATORS = ["isai", "aadi", "noah"];

// Non-creator campaigns are kept verbatim (App-centric ads India,
// App-centric ads, etc.). Only creator campaigns get folded.
export function normalizeCampaignName(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  for (const c of CREATORS) {
    // Match "isai", "isai tiktok", "isai insta", "isai instagram", etc.
    // Anchored on the creator name being either the whole string or the
    // first word — avoids accidentally matching a campaign named after
    // a broader term that happens to contain a creator name.
    if (lower === c || lower.startsWith(c + " ") || lower.startsWith(c + "-")) {
      return c.charAt(0).toUpperCase() + c.slice(1);
    }
  }
  return trimmed;
}

export function parseCampaignFilter(raw: string | undefined): CampaignFilter {
  if (!raw || raw === "all") return "all";
  return raw;
}

// Match a user doc against the filter. Both sides get normalized so
// "Isai" filter matches users whose stored campaign is "Isai TikTok",
// "Isai Insta", or "Isai" verbatim.
export function matchesCampaign(
  filter: CampaignFilter,
  d: Record<string, unknown>,
): boolean {
  if (filter === "all") return true;
  const rawCamp = d.attribution_campaign as string | undefined;
  const normCamp = normalizeCampaignName(rawCamp);
  if (!normCamp) return false;
  const normFilter = normalizeCampaignName(filter) ?? filter;
  return normCamp.toLowerCase() === normFilter.toLowerCase();
}
