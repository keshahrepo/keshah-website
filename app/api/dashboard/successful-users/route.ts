// Returns the "successful users" cohort: paid users who completed ≥30 days of routine.
// Source of truth for "best customer" analysis and qualitative interview lists.
//
// Definition: total_days_completed >= 30
//   where total_days_completed = count of progress.dayN entries with non-empty arrays
//
// Joined with UserCohorts (immutable signup snapshot) when available.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

interface SuccessfulUser {
  uid: string;
  email: string | null;
  display_name: string | null;
  total_days_completed: number;
  max_day: number;
  first_paid_at: string | null;
  paid_at: string | null;
  tenure_days: number | null;
  active_now: boolean;
  // Demographics
  gender: string | null;
  hair_loss_location: string | null;
  hair_goal: string | null;
  support_needs: string[];
  // Source
  signup_source: string | null;
  referral_source: string | null;
  plan: string | null;
  payment_provider: string | null;
  // Phone for WhatsApp link
  phone_e164: string | null;
}

export async function GET(req: Request) {
  try {
    const { db } = getFirebaseAdmin();
    const url = new URL(req.url);
    const minDays = parseInt(url.searchParams.get("minDays") ?? "30", 10);

    // Pull all paid-tagged users.
    const snap = await db
      .collection("Users")
      .where("extra_user_tags", "array-contains", "paidStoppage")
      .get();

    const now = Date.now();
    const users: SuccessfulUser[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.is_deleted) continue;

      // Count completed routine days from progress.dayN entries.
      const progress = (data.progress ?? {}) as Record<string, unknown[]>;
      const dayNumbers: number[] = [];
      for (const key of Object.keys(progress)) {
        if (!key.startsWith("day")) continue;
        const n = parseInt(key.slice(3), 10);
        if (!Number.isFinite(n)) continue;
        if (Array.isArray(progress[key]) && progress[key].length > 0) {
          dayNumbers.push(n);
        }
      }
      if (dayNumbers.length < minDays) continue;

      const maxDay = Math.max(...dayNumbers);
      const firstPaidAtMs =
        data.first_paid_at?.toDate?.()?.getTime?.() ??
        data.paid_at?.toDate?.()?.getTime?.() ??
        null;
      const tenureDays = firstPaidAtMs ? Math.floor((now - firstPaidAtMs) / 86400000) : null;

      const phone = (data.phone_number ?? data.phone) as
        | { complete_number?: string; country_dial_code?: string; national_number?: string }
        | undefined;
      const phoneE164 = phone?.complete_number ?? null;

      const wpUser = data.wp_user as { display_name?: string } | undefined;

      users.push({
        uid: doc.id,
        email: (data.email as string) ?? null,
        display_name: wpUser?.display_name ?? null,
        total_days_completed: dayNumbers.length,
        max_day: maxDay,
        first_paid_at: data.first_paid_at?.toDate?.()?.toISOString?.() ?? null,
        paid_at: data.paid_at?.toDate?.()?.toISOString?.() ?? null,
        tenure_days: tenureDays,
        active_now: !!(data.razorpay_subscription_id || data.payment_provider === "rc_billing"),
        gender: (data.selected_gender as string) ?? null,
        hair_loss_location: (data.hair_loss_location as string) ?? null,
        hair_goal: (data.hair_goal as string) ?? null,
        support_needs: Array.isArray(data.support_needs)
          ? (data.support_needs as string[])
          : [],
        signup_source: (data.signup_source as string) ?? null,
        referral_source: (data.referral_source as string) ?? null,
        plan: (data.plan as string) ?? null,
        payment_provider: (data.payment_provider as string) ?? null,
        phone_e164: phoneE164,
      });
    }

    users.sort((a, b) => b.total_days_completed - a.total_days_completed);

    return NextResponse.json({
      ok: true,
      min_days_filter: minDays,
      total: users.length,
      users,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
