import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

export const maxDuration = 60;

// Only count users after WhatsApp nurture + new paywall launched
const WHATSAPP_LAUNCH_DATE = new Date("2026-03-25T00:00:00Z");

// Must match app_consts.dart tier-1 timezones
const TIER_1_TIMEZONES = new Set([
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "America/Vancouver", "Europe/London", "Europe/Dublin",
  "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland",
  "Europe/Berlin", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Copenhagen",
  "Europe/Oslo", "Europe/Zurich", "Europe/Vienna", "Europe/Brussels", "Europe/Helsinki", "Europe/Paris",
  "Asia/Singapore", "Asia/Dubai", "Asia/Hong_Kong", "Asia/Kuwait", "Asia/Qatar", "Asia/Riyadh",
]);
const INDIA_TIMEZONES = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

function classifyGeo(tz: string): "tier_1" | "india" | "tier_2" {
  if (TIER_1_TIMEZONES.has(tz)) return "tier_1";
  if (INDIA_TIMEZONES.has(tz)) return "india";
  return "tier_2";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const geoFilter = searchParams.get("geo") || "all"; // all, tier_1, india, tier_2
  try {
    const { db } = getFirebaseAdmin();

    const snapshot = await db
      .collection("Users")
      .where("nurture_started_at", "!=", null)
      .select(
        "nurture_started_at",
        "start_date",
        "nurture_whatsapp_sent",
        "whatsapp_converted",
        "nurture_whatsapp_stopped",
        "conversion_source",
        "converted_at",
        "phone_number",
        "selected_gender",
        "user_local_time_zone",
        "userLocalTimeZone"
      )
      .get();

    let totalPaywallViewed = 0;
    let hasPhoneNumber = 0;
    let whatsappMessaged = 0;
    let whatsappConverted = 0;
    let whatsappStopped = 0;
    let directConverted = 0;
    let trialModalConverted = 0;
    let totalConverted = 0;
    let noConvertNoWhatsapp = 0;

    // Conversion by WhatsApp day
    const conversionByDay: Record<string, number> = {};

    // Messages sent per template
    const templatesSent: Record<string, number> = {};

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const tz = data.userLocalTimeZone || data.user_local_time_zone || "";
      const geo = classifyGeo(tz);

      if (geoFilter !== "all" && geo !== geoFilter) continue;

      // Skip users from before WhatsApp launch
      const nurtureStart = data.nurture_started_at;
      if (nurtureStart) {
        const startMs = nurtureStart.toMillis ? nurtureStart.toMillis() : (nurtureStart._seconds || 0) * 1000;
        if (startMs < WHATSAPP_LAUNCH_DATE.getTime()) continue;
      }

      totalPaywallViewed++;

      const hasPhone = !!data.phone_number?.complete_number;
      if (hasPhone) hasPhoneNumber++;

      const whatsappSent: string[] = data.nurture_whatsapp_sent || [];
      const wasMessaged = whatsappSent.length > 0;
      if (wasMessaged) whatsappMessaged++;

      const hasPurchased = !!data.start_date;

      if (hasPurchased) {
        totalConverted++;

        const source = data.conversion_source || "unknown";
        if (source === "direct") directConverted++;
        else if (source === "trial_modal") trialModalConverted++;

        if (data.whatsapp_converted) {
          whatsappConverted++;

          // Figure out which day they converted
          if (data.nurture_started_at && data.converted_at) {
            const startMs = data.nurture_started_at.toMillis
              ? data.nurture_started_at.toMillis()
              : data.nurture_started_at._seconds * 1000;
            const convertMs = data.converted_at.toMillis
              ? data.converted_at.toMillis()
              : data.converted_at._seconds * 1000;
            const dayConverted = Math.floor((convertMs - startMs) / 86_400_000) + 1;
            const key = `day_${dayConverted}`;
            conversionByDay[key] = (conversionByDay[key] || 0) + 1;
          }
        }
      } else if (!wasMessaged) {
        noConvertNoWhatsapp++;
      }

      if (data.nurture_whatsapp_stopped) whatsappStopped++;

      for (const tmpl of whatsappSent) {
        templatesSent[tmpl] = (templatesSent[tmpl] || 0) + 1;
      }
    }

    const notConverted = totalPaywallViewed - totalConverted;

    return NextResponse.json({
      // Funnel overview
      funnel: {
        paywall_viewed: totalPaywallViewed,
        has_phone_number: hasPhoneNumber,
        phone_collection_rate:
          totalPaywallViewed > 0
            ? `${((hasPhoneNumber / totalPaywallViewed) * 100).toFixed(1)}%`
            : "0%",
        whatsapp_messaged: whatsappMessaged,
        total_converted: totalConverted,
        not_converted: notConverted,
      },

      // Conversion sources
      conversion_sources: {
        direct: directConverted,
        trial_modal: trialModalConverted,
        whatsapp_influenced: whatsappConverted,
        unknown: totalConverted - directConverted - trialModalConverted,
      },

      // Conversion rates
      rates: {
        overall: totalPaywallViewed > 0
          ? `${((totalConverted / totalPaywallViewed) * 100).toFixed(1)}%`
          : "0%",
        direct_rate: totalPaywallViewed > 0
          ? `${((directConverted / totalPaywallViewed) * 100).toFixed(1)}%`
          : "0%",
        trial_modal_rate: totalPaywallViewed > 0
          ? `${((trialModalConverted / totalPaywallViewed) * 100).toFixed(1)}%`
          : "0%",
        whatsapp_conversion_rate: whatsappMessaged > 0
          ? `${((whatsappConverted / whatsappMessaged) * 100).toFixed(1)}%`
          : "0%",
      },

      // WhatsApp engagement
      whatsapp: {
        messaged: whatsappMessaged,
        converted: whatsappConverted,
        stopped: whatsappStopped,
        stop_rate: whatsappMessaged > 0
          ? `${((whatsappStopped / whatsappMessaged) * 100).toFixed(1)}%`
          : "0%",
        conversion_by_day: conversionByDay,
        templates_sent: templatesSent,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
