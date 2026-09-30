// Outreach-sender filter primitives.
//
// Backed by `outreach_first_click_sender` on Users, written by the mobile
// app when a lead taps a 1:1 outreach link (keshah.com/app/paywall?s=<sender>).
// See PaywallEntryScreen in the mobile repo.
//
// DELIBERATELY SEPARATE FROM THE CAMPAIGN FILTER. They answer different
// questions and a lead can legitimately have both:
//
//   attribution_campaign          where the INSTALL came from (Isai, ads)
//   outreach_first_click_sender   who CLOSED them (a 1:1 message)
//
// Someone can install off an Isai video, stall at the paywall for a fortnight,
// then subscribe after Ani texts them. Isai earned the install and Ani earned
// the conversion; neither should overwrite the other, so these stay in their
// own namespaces and their own filters.
//
// FIRST touch wins: the field is written once, on the first tap, so a later
// sender can't claim a lead someone else already reached.

export type OutreachSenderFilter = "all" | string;

export function parseOutreachSenderFilter(
  raw: string | undefined,
): OutreachSenderFilter {
  if (!raw || raw === "all") return "all";
  return raw;
}

/** Display form for a sender key: "ani" -> "Ani". */
export function senderLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Normalized bucket for a user doc, or null if they never tapped a link. */
export function senderBucket(d: Record<string, unknown>): string | null {
  const raw = d.outreach_first_click_sender as string | undefined;
  const t = raw?.trim();
  if (!t) return null;
  return senderLabel(t);
}

export function matchesOutreachSender(
  filter: OutreachSenderFilter,
  d: Record<string, unknown>,
): boolean {
  if (filter === "all") return true;
  const bucket = senderBucket(d);
  if (!bucket) return false;
  return bucket.toLowerCase() === filter.trim().toLowerCase();
}
