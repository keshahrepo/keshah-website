import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

export const maxDuration = 60;

// Only count freev2 users created after direct purchase launched (no trial)
const PAID_STOPPAGE_LAUNCH = new Date("2026-02-23T00:00:00Z");
// Click tracking started — overview dashboard uses this as baseline
const CLICK_TRACKING_START = new Date("2026-03-04T15:30:00Z");

// 22 countries — must match kEligibleCountryTimezones in app_consts.dart
const TIER_1_TIMEZONES = new Set([
  // US
  "America/New_York", "America/Detroit", "America/Kentucky/Louisville", "America/Kentucky/Monticello",
  "America/Indiana/Indianapolis", "America/Indiana/Vincennes", "America/Indiana/Winamac",
  "America/Indiana/Marengo", "America/Indiana/Petersburg", "America/Indiana/Tell_City", "America/Indiana/Vevay",
  "America/Chicago", "America/Menominee", "America/North_Dakota/Center", "America/North_Dakota/New_Salem",
  "America/North_Dakota/Beulah", "America/Denver", "America/Boise", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "America/Juneau", "America/Sitka", "America/Metlakatla",
  "America/Nome", "America/Yakutat", "America/Adak", "Pacific/Honolulu",
  // Canada
  "America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Regina",
  "America/St_Johns", "America/Halifax", "America/Moncton", "America/Goose_Bay", "America/Glace_Bay",
  "America/Whitehorse", "America/Yellowknife", "America/Iqaluit", "America/Rankin_Inlet",
  "America/Resolute", "America/Swift_Current", "America/Rainy_River", "America/Inuvik",
  "America/Cambridge_Bay", "America/Pangnirtung", "America/Nipigon", "America/Thunder_Bay",
  // UK & Ireland
  "Europe/London", "Europe/Dublin",
  // Australia
  "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth",
  "Australia/Adelaide", "Australia/Darwin", "Australia/Hobart", "Australia/Currie",
  "Australia/Broken_Hill", "Australia/Lindeman", "Australia/Lord_Howe", "Australia/Eucla",
  // New Zealand
  "Pacific/Auckland", "Pacific/Chatham",
  // Germany, Netherlands, Sweden, Denmark, Norway, Switzerland, Austria, Belgium, Finland, France
  "Europe/Berlin", "Europe/Busingen", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Copenhagen",
  "Europe/Oslo", "Europe/Zurich", "Europe/Vienna", "Europe/Brussels", "Europe/Helsinki", "Europe/Paris",
  // Singapore, UAE, Hong Kong, Kuwait, Qatar, Saudi Arabia
  "Asia/Singapore", "Asia/Dubai", "Asia/Hong_Kong", "Asia/Kuwait", "Asia/Qatar", "Asia/Riyadh",
]);
const INDIA_TIMEZONES = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

function classifyGeo(tz: string): "tier_1" | "india" | "tier_2" {
  if (TIER_1_TIMEZONES.has(tz)) return "tier_1";
  if (INDIA_TIMEZONES.has(tz)) return "india";
  return "tier_2";
}

const SELECTED_FIELDS = [
  "created_at", "user_type", "treatment_stage", "userLocalTimeZone",
  "is_deleted", "referral_source", "start_date",
  "hair_goal", "quiz_answers", "commitment_answer",
  "open_account", "extra_user_tags",
  "hair_fall_check_ins",
  "regrowth_education_drip_started_at", "regrowth_education_drip_completed",
  "regrowth_consultation_completed", "regrowth_treatment_purchased",
  "inflammation_check_completed", "inflammation_check_result",
  "scalp_health_support_purchased", "completed_donation_amount",
  "progress",
];

export async function GET() {
  try {
    const { db } = getFirebaseAdmin();
    const today = new Date().toISOString().split("T")[0];

    // Helper: fetch live click counts from Creators collection
    async function fetchLiveClicks() {
      let total = 0, today_clicks = 0, week_clicks = 0, month_clicks = 0;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(todayStart.getTime() - 7 * 86400000);
      const monthAgo = new Date(todayStart.getTime() - 30 * 86400000);
      try {
        const snap = await db.collection("Creators").where("is_active", "==", true).get();
        const promises = snap.docs.map(async (doc) => {
          total += doc.data().total_clicks || 0;
          try {
            const clicksSnap = await doc.ref.collection("clicks").where("timestamp", ">=", monthAgo).get();
            clicksSnap.forEach((c) => {
              month_clicks++;
              const ts = c.data().timestamp?.toDate?.();
              if (ts && ts >= weekAgo) week_clicks++;
              if (ts && ts >= todayStart) today_clicks++;
            });
          } catch { /* no clicks */ }
        });
        await Promise.all(promises);
      } catch { /* no creators */ }
      return { today: today_clicks, week: week_clicks, month: month_clicks, total };
    }

    // 1. Try pre-computed metrics first, but always use live clicks
    const metricsDoc = await db.collection("DashboardMetrics").doc(`daily_${today}`).get();
    if (metricsDoc.exists) {
      const cached = metricsDoc.data();
      const liveClicks = await fetchLiveClicks();
      return NextResponse.json({ ...cached, creator_clicks: liveClicks });
    }

    // 2. Only fetch freev2 users created after paid stoppage launch (Feb 9, 2026)
    const usersSnap = await db.collection("Users")
      .where("created_at", ">=", PAID_STOPPAGE_LAUNCH)
      .select(...SELECTED_FIELDS)
      .get();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(todayStart.getTime() - 7 * 86400000);
    const monthAgo = new Date(todayStart.getTime() - 30 * 86400000);

    let totalUsers = 0, newToday = 0, newThisWeek = 0, newThisMonth = 0;
    const usersByType: Record<string, number> = {};
    const usersByStage: Record<string, number> = {};
    const usersByGeo: Record<string, number> = { tier_1: 0, india: 0, tier_2: 0 };
    const referralSources: Record<string, number> = {};
    let signedUp = 0, onboardingComplete = 0, paywallViewed = 0, purchased = 0;
    let purchasedToday = 0, purchasedThisWeek = 0, purchasedThisMonth = 0;
    let signupsSinceTracking = 0, purchasedSinceTracking = 0;
    let trackedSignupsToday = 0, trackedSignupsWeek = 0, trackedSignupsMonth = 0;
    let trackedPurchasedToday = 0, trackedPurchasedWeek = 0, trackedPurchasedMonth = 0;

    // Per-geo funnel tracking
    type GeoKey = "tier_1" | "india" | "tier_2";
    const geoFunnels: Record<GeoKey, { signed_up: number; onboarding_complete: number; paywall_viewed: number; purchased: number }> = {
      tier_1: { signed_up: 0, onboarding_complete: 0, paywall_viewed: 0, purchased: 0 },
      india: { signed_up: 0, onboarding_complete: 0, paywall_viewed: 0, purchased: 0 },
      tier_2: { signed_up: 0, onboarding_complete: 0, paywall_viewed: 0, purchased: 0 },
    };
    const geoReferrals: Record<GeoKey, Record<string, number>> = { tier_1: {}, india: {}, tier_2: {} };
    const geoStages: Record<GeoKey, Record<string, number>> = { tier_1: {}, india: {}, tier_2: {} };

    const retention = {
      day7: { eligible: 0, active: 0 },
      day14: { eligible: 0, active: 0 },
      day30: { eligible: 0, active: 0 },
    };
    const checkInDay30: Record<string, number> = {};
    const checkInDay60: Record<string, number> = {};
    const regrowthFunnel = { education_started: 0, education_done: 0, consultation: 0, purchased: 0 };
    const inflammationFunnel = { check_completed: 0, positive: 0, kit_purchased: 0 };
    // Day completion curve: dayCompletion[n] = users who completed day n, dayEligible[n] = users old enough to have reached day n
    const dayCompletion: Record<number, number> = {};
    const dayEligible: Record<number, number> = {};
    let usersWithProgress = 0;
    let regrowthKits = 0, scalpHealthKits = 0, donations = 0;

    usersSnap.forEach((doc) => {
      const d = doc.data();
      if (d.is_deleted) return;

      const createdAt = d.created_at?.toDate?.() || null;
      if (!createdAt) return;

      totalUsers++;
      signedUp++;

      // Since-tracking counts (for overview dashboard alignment)
      if (createdAt >= CLICK_TRACKING_START) {
        signupsSinceTracking++;
        if (createdAt >= todayStart) trackedSignupsToday++;
        if (createdAt >= weekAgo) trackedSignupsWeek++;
        if (createdAt >= monthAgo) trackedSignupsMonth++;
        if (d.start_date) {
          purchasedSinceTracking++;
          if (createdAt >= todayStart) trackedPurchasedToday++;
          if (createdAt >= weekAgo) trackedPurchasedWeek++;
          if (createdAt >= monthAgo) trackedPurchasedMonth++;
        }
      }

      // New user counts
      if (createdAt >= todayStart) newToday++;
      if (createdAt >= weekAgo) newThisWeek++;
      if (createdAt >= monthAgo) newThisMonth++;

      // Retention eligibility
      const ageDays = Math.floor((now.getTime() - createdAt.getTime()) / 86400000);
      if (ageDays >= 7) retention.day7.eligible++;
      if (ageDays >= 14) retention.day14.eligible++;
      if (ageDays >= 30) retention.day30.eligible++;

      // User type
      const ut = d.user_type || "unknown";
      usersByType[ut] = (usersByType[ut] || 0) + 1;

      // Treatment stage
      const stage = d.treatment_stage || "NONE";
      usersByStage[stage] = (usersByStage[stage] || 0) + 1;

      // Geo
      const geo = classifyGeo(d.userLocalTimeZone || "");
      usersByGeo[geo]++;
      geoFunnels[geo].signed_up++;

      // Referral source
      if (d.referral_source) {
        referralSources[d.referral_source] = (referralSources[d.referral_source] || 0) + 1;
        geoReferrals[geo][d.referral_source] = (geoReferrals[geo][d.referral_source] || 0) + 1;
      }

      // Treatment stage per geo
      geoStages[geo][stage] = (geoStages[geo][stage] || 0) + 1;

      // Funnel: hair_goal = finished onboarding questions, commitment_answer = qualified, start_date = purchased
      // Note: no reliable Firestore field for "paywall viewed" — that's tracked in Amplitude (~82%)
      if (d.hair_goal) { onboardingComplete++; geoFunnels[geo].onboarding_complete++; }
      if (d.commitment_answer) { paywallViewed++; geoFunnels[geo].paywall_viewed++; }
      if (d.start_date) {
        purchased++; geoFunnels[geo].purchased++;
        // Track purchase timing using created_at as proxy (start_date is a map, not timestamp)
        if (createdAt >= todayStart) purchasedToday++;
        if (createdAt >= weekAgo) purchasedThisWeek++;
        if (createdAt >= monthAgo) purchasedThisMonth++;
      }

      // Check-ins
      if (Array.isArray(d.hair_fall_check_ins)) {
        for (const ci of d.hair_fall_check_ins) {
          if (ci.day === 30 && ci.status) checkInDay30[ci.status] = (checkInDay30[ci.status] || 0) + 1;
          if (ci.day === 60 && ci.status) checkInDay60[ci.status] = (checkInDay60[ci.status] || 0) + 1;
        }
      }

      // Regrowth funnel
      if (d.regrowth_education_drip_started_at) regrowthFunnel.education_started++;
      if (d.regrowth_education_drip_completed) regrowthFunnel.education_done++;
      if (d.regrowth_consultation_completed) regrowthFunnel.consultation++;
      if (d.regrowth_treatment_purchased) { regrowthFunnel.purchased++; regrowthKits++; }

      // Inflammation funnel
      if (d.inflammation_check_completed) inflammationFunnel.check_completed++;
      if (d.inflammation_check_result === "positive") inflammationFunnel.positive++;
      if (d.scalp_health_support_purchased) { inflammationFunnel.kit_purchased++; scalpHealthKits++; }

      if (d.completed_donation_amount) donations += d.completed_donation_amount;

      // Day completion curve — only for purchased users
      if (d.start_date) {
        // Track eligibility: user is eligible for day N if they've been around N+ days
        // ageDays+1 because a user who signed up today (ageDays=0) is eligible for day 1
        for (let day = 1; day <= Math.min(ageDays + 1, 120); day++) {
          dayEligible[day] = (dayEligible[day] || 0) + 1;
        }

        if (d.progress && typeof d.progress === "object") {
          const completedDays = Object.keys(d.progress)
            .map((k) => parseInt(k.replace("day", "")))
            .filter((n) => !isNaN(n));
          if (completedDays.length > 0) {
            usersWithProgress++;
            for (const day of completedDays) {
              dayCompletion[day] = (dayCompletion[day] || 0) + 1;
            }
          }
        }
      }
    });

    // Sum all creator clicks (total from docs, today/week/month from subcollections)
    let totalCreatorClicks = 0;
    let todayCreatorClicks = 0;
    let weekCreatorClicks = 0;
    let monthCreatorClicks = 0;
    try {
      const creatorsSnap = await db.collection("Creators").where("is_active", "==", true).get();
      const clickPromises = creatorsSnap.docs.map(async (doc) => {
        totalCreatorClicks += doc.data().total_clicks || 0;
        try {
          const monthClicksSnap = await doc.ref.collection("clicks").where("timestamp", ">=", monthAgo).get();
          monthClicksSnap.forEach((c) => {
            monthCreatorClicks++;
            const ts = c.data().timestamp?.toDate?.();
            if (ts && ts >= weekAgo) weekCreatorClicks++;
            if (ts && ts >= todayStart) todayCreatorClicks++;
          });
        } catch { /* no clicks yet */ }
      });
      await Promise.all(clickPromises);
    } catch { /* no creators yet */ }

    const metrics = {
      date: today,
      cohort_start: "2026-02-23",
      creator_clicks: { today: todayCreatorClicks, week: weekCreatorClicks, month: monthCreatorClicks, total: totalCreatorClicks },
      total_users: totalUsers,
      new_users: { today: newToday, week: newThisWeek, month: newThisMonth },
      users_by_type: usersByType,
      users_by_stage: usersByStage,
      users_by_geo: usersByGeo,
      funnel: { signed_up: signedUp, onboarding_complete: onboardingComplete, paywall_viewed: paywallViewed, purchased },
      purchased_by_period: { today: purchasedToday, week: purchasedThisWeek, month: purchasedThisMonth, total: purchased },
      tracked_signups: { today: trackedSignupsToday, week: trackedSignupsWeek, month: trackedSignupsMonth, all: signupsSinceTracking },
      tracked_purchased: { today: trackedPurchasedToday, week: trackedPurchasedWeek, month: trackedPurchasedMonth, all: purchasedSinceTracking },
      geo_funnels: geoFunnels,
      geo_referrals: geoReferrals,
      geo_stages: geoStages,
      referral_sources: referralSources,
      retention: {
        day_7: { ...retention.day7, rate: retention.day7.eligible > 0 ? Math.round((retention.day7.active / retention.day7.eligible) * 100) : 0 },
        day_14: { ...retention.day14, rate: retention.day14.eligible > 0 ? Math.round((retention.day14.active / retention.day14.eligible) * 100) : 0 },
        day_30: { ...retention.day30, rate: retention.day30.eligible > 0 ? Math.round((retention.day30.active / retention.day30.eligible) * 100) : 0 },
      },
      routine: { completed_today: 0, total_active: 0 },
      check_in_day_30: checkInDay30,
      check_in_day_60: checkInDay60,
      regrowth_funnel: regrowthFunnel,
      inflammation_funnel: inflammationFunnel,
      day_completion: dayCompletion,
      day_eligible: dayEligible,
      users_with_progress: usersWithProgress,
      purchases: { regrowth_kits: regrowthKits, scalp_health_kits: scalpHealthKits, donations: Math.round(donations * 100) / 100 },
    };

    // Cache result for today
    db.collection("DashboardMetrics").doc(`daily_${today}`).set(metrics).catch(() => {});

    return NextResponse.json(metrics);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Metrics error:", message);
    return NextResponse.json({ error: "Failed to compute metrics", detail: message }, { status: 500 });
  }
}
