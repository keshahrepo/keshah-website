/**
 * Installs per 1,000 views: link installs divided by views gained on the same
 * days, per account (Aadi + each creator) and overall. The core "is content
 * turning into users" number.
 *
 * Views are the views each account's posts GAINED that day (from the 6-hourly
 * views_history snapshots), not views of posts posted that day, so installs
 * and views always cover the same days. A post first seen after tracking began
 * counts all its views as new; older posts only count growth. Pinned posts are
 * left out: their views are people already on the profile.
 *
 * Refreshed hourly with the installs chart (lib/founder/installs-daily.ts) into
 * Stats/installs_per_1k; GET /api/founder/installs-per-1k serves it.
 */

/** Snapshots started 2026-10-06 18:15 UTC, so the 7th is the first full day of gains. */
export const VIEWS_TRACKED_FROM = "2026-10-07";
export const PER_1K_DOC = "installs_per_1k";

export type PostViews = { local_date?: string; pinned?: boolean; views_history?: { at: string; views: number }[] };

/** Views gained per UTC day across an account's posts (pinned posts skipped). */
export function viewsGainedByDay(posts: PostViews[], trackedFrom = VIEWS_TRACKED_FROM): Map<string, number> {
  const out = new Map<string, number>();
  const add = (d: string, n: number) => n > 0 && out.set(d, (out.get(d) ?? 0) + n);
  for (const p of posts) {
    if (p.pinned) continue;
    const h = [...(p.views_history ?? [])].filter((s) => s && typeof s.at === "string" && Number.isFinite(s.views)).sort((a, b) => a.at.localeCompare(b.at));
    h.forEach((s, i) => {
      const day = s.at.slice(0, 10);
      if (i === 0) {
        // A post that appeared after tracking began: everything it has is new.
        if ((p.local_date ?? "") >= trackedFrom) add(day, s.views);
        return;
      }
      add(day, s.views - h[i - 1].views);
    });
  }
  return out;
}

/** Stored per account: date -> [views gained, link installs]. */
export type AccountDays = { id: string; name: string; isAadi: boolean; noTag: boolean; days: Record<string, [number, number]> };

export type Per1k = { views: number; installs: number; per1k: number | null };

export function per1k(views: number, installs: number): Per1k {
  return { views, installs, per1k: views > 0 ? (installs / views) * 1000 : null };
}

/** Totals for an account over [from, to] (inclusive yyyy-mm-dd). */
export function sumDays(a: AccountDays, from: string, to: string): Per1k {
  let v = 0;
  let n = 0;
  for (const [d, [views, installs]] of Object.entries(a.days)) {
    if (d < from || d > to) continue;
    v += views;
    n += installs;
  }
  return per1k(v, n);
}

/** Monday of the week containing `d` (yyyy-mm-dd, UTC). */
export function weekStart(d: string): string {
  const t = Date.parse(d + "T00:00:00Z");
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * 86400000).toISOString().slice(0, 10);
}

/** Week-by-week totals (Monday starts) over [from, to], oldest first; partial edge weeks included. */
export function byWeek(accounts: AccountDays[], from: string, to: string): ({ week: string } & Per1k)[] {
  const weeks = new Map<string, [number, number]>();
  for (const a of accounts)
    for (const [d, [v, n]] of Object.entries(a.days)) {
      if (d < from || d > to) continue;
      const w = weekStart(d);
      const cur = weeks.get(w) ?? [0, 0];
      weeks.set(w, [cur[0] + v, cur[1] + n]);
    }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, [v, n]]) => ({ week, ...per1k(v, n) }));
}

/** The window a period covers, clipped to tracked days and to yesterday (today is still filling). */
export function windowFor(period: string, now = new Date()): { from: string; to: string } | null {
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  let from = VIEWS_TRACKED_FROM;
  let to = yesterday;
  if (period !== "all") {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) return null;
    const start = `${period}-01`;
    const end = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).toISOString().slice(0, 10);
    from = start > from ? start : from;
    to = end < to ? end : to;
  }
  return from <= to ? { from, to } : null;
}
