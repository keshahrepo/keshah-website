/**
 * The founder app's App tab: per mobile release, the trial cohort (same maths
 * as the web Trial page) and the onboarding funnel (same stages as the web
 * Onboarding page), for the chosen release and the one before it.
 */
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { MOBILE_RELEASES, getPreviousRelease, getRelease, getReleaseWindow } from "@/lib/release-history";
import { TRIAL_USER_FIELDS, computeMetrics, isTestEmail, toTrialUser, tsToMs, type TrialUser } from "@/lib/dashboard/trial-cohort";
import { FUNNEL_FIELDS, FUNNEL_STAGES, IS_NEW_BUILD_USER } from "@/lib/dashboard/onboarding-funnel";

export interface CohortSummary {
  slug: string;
  label: string;
  from: string;
  to: string;
  signups: number;
  trials: number;
  /** Trials that started 8+ days ago, and how many of them paid. */
  mature: number;
  matureConverted: number;
  converted: number;
  stillInTrial: number;
  cancelledInTrial: number;
  paymentFailed: number;
  revenueUsd: number;
  proceedsUsd: number;
  engagement: { label: string; count: number }[];
  onboarding: { key: string; label: string; count: number }[];
}

export interface AppMetrics {
  releases: { slug: string; label: string; date: string | null }[];
  current: CohortSummary | null;
  previous: CohortSummary | null;
}

export async function appMetrics(slug?: string): Promise<AppMetrics> {
  const releases = MOBILE_RELEASES.filter((r) => !r.slug.startsWith("all_time")).map((r) => ({ slug: r.slug, label: r.label, date: r.date }));
  // Default: the newest release old enough to have finished trials (shipped 9+ days ago).
  const matureCut = Date.now() - 9 * 86_400_000;
  const settled = releases.find((r) => r.date && Date.parse(r.date) < matureCut);
  const curSlug = slug && getRelease(slug) ? slug : (settled ?? releases[0])?.slug;
  if (!curSlug) return { releases, current: null, previous: null };
  const prevSlug = getPreviousRelease(curSlug, MOBILE_RELEASES)?.slug;
  const wins = [curSlug, prevSlug].filter(Boolean).map((s) => ({ slug: s!, win: getReleaseWindow(s!, MOBILE_RELEASES) }));
  const from = new Date(Math.min(...wins.map((w) => w.win?.from.getTime() ?? Date.now())));
  const to = new Date(Math.max(...wins.map((w) => w.win?.to.getTime() ?? Date.now())));

  const snap = await getFirebaseAdmin()
    .db.collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(from))
    .where("created_at", "<=", Timestamp.fromDate(to))
    .select(...new Set<string>([...TRIAL_USER_FIELDS, ...FUNNEL_FIELDS]))
    .get();

  const now = Date.now();
  const build = (s: string | undefined): CohortSummary | null => {
    if (!s) return null;
    const w = getReleaseWindow(s, MOBILE_RELEASES);
    const rel = getRelease(s);
    if (!w || !rel) return null;
    const users: TrialUser[] = [];
    let signups = 0;
    const funnel: Record<string, number> = Object.fromEntries(FUNNEL_STAGES.map((x) => [x.key, 0]));
    for (const doc of snap.docs) {
      const d = doc.data();
      if (isTestEmail(d.email)) continue;
      const createdMs = tsToMs(d.created_at);
      if (createdMs === null || createdMs < w.from.getTime() || createdMs >= w.to.getTime()) continue;
      signups++;
      if (IS_NEW_BUILD_USER(d)) for (const st of FUNNEL_STAGES) if (st.check(d)) funnel[st.key]++;
      if (d.started_trial) users.push(toTrialUser(d, createdMs, d.selected_gender as string | undefined));
    }
    const m = computeMetrics(users, signups, now);
    return {
      slug: s,
      label: rel.label,
      from: w.from.toISOString(),
      to: w.to.toISOString(),
      signups,
      trials: m.total,
      mature: m.outcomes.mature,
      matureConverted: m.outcomes.matureConverted,
      converted: m.outcomes.converted,
      stillInTrial: m.outcomes.stillInTrial,
      cancelledInTrial: m.outcomes.cancelledInTrial,
      paymentFailed: m.outcomes.paymentFailed,
      revenueUsd: Math.round(m.revenueUsd * 100) / 100,
      proceedsUsd: Math.round(m.proceedsUsd * 100) / 100,
      engagement: m.funnel.map((f) => ({ label: f.label, count: f.count })),
      onboarding: FUNNEL_STAGES.map((st) => ({ key: st.key, label: st.label, count: funnel[st.key] })),
    };
  };
  return { releases, current: build(curSlug), previous: build(prevSlug) };
}
