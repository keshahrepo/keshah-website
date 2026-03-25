import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

export const maxDuration = 60;

export async function GET() {
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
        "user_local_time_zone"
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
