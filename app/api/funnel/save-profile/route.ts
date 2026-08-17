// Writes the user's Firebase profile + web quiz answers + onboarding-complete
// flags to Firestore. Runs post-purchase on the SignUp step. The shape here
// must match exactly what the mobile app writes during PostAuthFlow2 — the
// app's splash/dashboard/userDay logic reads these specific fields with
// specific formats, and any deviation produces gray screens or -1 counters.
//
// Reference template came from diffing 4 real app-onboarded paid users
// against a broken web-onboarded user.

import { NextResponse } from "next/server";
import { createCipheriv } from "crypto";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// Matches PasswordServices in the mobile app (lib/services/password_services.dart).
// AES-256-CBC with PKCS7 padding, IV of 16 zero bytes, base64 output.
const AES_KEY = Buffer.from("keshah.com-is-a-secureeee-key!!!", "utf8");
const AES_IV = Buffer.alloc(16, 0);

function encryptPassword(plain: string): string {
  const cipher = createCipheriv("aes-256-cbc", AES_KEY, AES_IV);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return encrypted.toString("base64");
}

interface QuizAnswers {
  gender?: "male" | "female";
  hairLossLocation?: "crown" | "hairline" | "all_over";
  treatmentsTried?: string[];
  hairGoal?: "stop_the_loss" | "regrow_hair" | "both";
  commitmentAnswer?: "yes" | "no";
  supportNeeds?: string[];
  /** Captured pre-paywall on /startindia. Preferred over Firebase
   *  Auth displayName for wp_user.display_name (more reliable). */
  firstName?: string;
  /** Captured pre-paywall on /startindia. Already saved to Firestore
   *  by /api/funnel/save-lead. Included here for completeness. */
  phoneNumber?: string;
}

interface SavePayload {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  providerId?: "google.com" | "apple.com" | "password";
  /** Plaintext password — only sent for email/password signups. Server
   *  encrypts with the same AES-CBC scheme as the mobile app and stores
   *  in Firestore so the app's AuthRepo email login flow accepts it. */
  password?: string;
  quizAnswers?: QuizAnswers;
  /** Affiliate slug derived from the landing path. e.g. "chad" for
   *  /chad. null for direct /start traffic. */
  referralSource?: string | null;
  /** Paywall tier the user bought. Written to Firestore for affiliate
   *  commission reporting. */
  plan?: "monthly" | "threeMonth" | "annual" | "weekly";
  /** Which billing system processed the payment — lets the admin page
   *  price out US vs India revenue separately. */
  paymentProvider?: "razorpay" | "rc_billing";
  /** Tags the signup path. Used to scope downstream flows — e.g. the
   *  trial-end reminder email only fires for "startfree_us_trial". */
  signupSource?: "startfree_us_trial";
  /** Trial duration in days. Drives `trial_ends_at` which the reminder
   *  function queries on. */
  trialDays?: number;
  /** IANA timezone from the browser (e.g. "America/Los_Angeles",
   *  "Asia/Kolkata"). Used to compute start_date.date in the user's
   *  local day boundary AND set userLocalTimeZone — which the mobile
   *  app's `isEligibleRegrowthFeatureTimezone` check uses to classify
   *  tier-1 vs tier-2 country (drives chat access, regrowth education).
   *  Hardcoded IST previously misclassified every US payer as tier-2. */
  timezone?: string;
  /** Minutes east of UTC at signup time (positive for IST, negative
   *  for Americas). Sent as `-new Date().getTimezoneOffset()`. */
  timezoneOffsetInMins?: number;
}

// start_date shape the mobile app's userDay calc expects. Date must be
// dd/MM/yyyy, time must be hh:mm AM/PM (zero-padded hour, uppercase
// meridiem). Mobile only reads start_date.date — timezone/offset fields
// are metadata. Falls back to IST if the client didn't send a zone (old
// builds, or in case of a bug) so India users keep working.
function buildStartDate(
  now: Date,
  timezone: string,
  offsetInMins: number,
): { date: string; time: string; timezone: string; timeZoneOffsetInMins: number } {
  const date = now.toLocaleDateString("en-GB", { timeZone: timezone });
  const time = now
    .toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
  return {
    date,
    time,
    timezone,
    timeZoneOffsetInMins: offsetInMins,
  };
}

export async function POST(req: Request) {
  let payload: SavePayload;
  try {
    payload = (await req.json()) as SavePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!payload.uid) {
    return NextResponse.json({ ok: false, error: "uid_required" }, { status: 400 });
  }

  try {
    const { db } = getFirebaseAdmin();
    const docRef = db.collection("Users").doc(payload.uid);

    // Read existing doc once — used to gate first-time-only field writes.
    // This prevents `paid_at`, `created_at`, `start_date`, `first_paid_at`
    // from being overwritten on subsequent calls (which destroyed cohort
    // analysis prior to this fix).
    const existing = await docRef.get();
    const existingData = existing.exists ? existing.data() ?? {} : {};
    const isFirstWrite = !existing.exists;

    const q = payload.quizAnswers ?? {};

    // Resolve the user's timezone. Browser sends IANA name + offset
    // (Intl.DateTimeFormat / Date.getTimezoneOffset). Old builds may
    // omit it — fall back to Asia/Kolkata so existing India clients
    // keep working unchanged.
    const tzFromBody = typeof payload.timezone === "string" && payload.timezone
      ? payload.timezone
      : "Asia/Kolkata";
    const tzOffsetFromBody = typeof payload.timezoneOffsetInMins === "number"
      ? payload.timezoneOffsetInMins
      : 330;

    const update: Record<string, unknown> = {
      email: payload.email ?? null,
      providerId: payload.providerId ?? null,

      // User state — matches a real paid mobile-app user's doc exactly.
      // The discriminator for "this user is paid" in the app is
      // `extra_user_tags` containing "paidStoppage" — not user_type or
      // treatment_stage, which stay at their free-tier defaults.
      user_type: "freev2",
      treatment_stage: "FREE_STOPPAGE",
      extra_user_tags: ["paidStoppage"],
      eligible_for_special_regrowth_features: true,
      userLocalTimeZone: tzFromBody,
      onboarding_flow_version: "B",
      is_deleted: false,

      // Onboarding-complete flags — skip the app's gender / starter-photos /
      // paywall screens. Splash checks starter_photos_submit_submitted_once
      // and routes straight to dashboard when true.
      starter_photos_submit_showed_once: true,
      starter_photos_submit_submitted_once: true,

      progress: existingData.progress ?? {},

      modified_at: FieldValue.serverTimestamp(),
    };

    // Immutable first-time fields — set ONCE, never overwritten on later
    // save-profile calls. Required for accurate cohort analysis (paid_at
    // and created_at were previously rewritten on every call, destroying
    // tenure data).
    if (!existingData.created_at) update.created_at = FieldValue.serverTimestamp();
    if (!existingData.start_date) {
      update.start_date = buildStartDate(new Date(), tzFromBody, tzOffsetFromBody);
    }

    // wp_user nested object — the app's LoginBloc queries
    // `wp_user.user_email`, and WPUserItem.fromJson reads `ID` (uppercase),
    // `user_email`, `display_name`, `purchase_types`.
    // Prefer firstName from the quiz (user-typed on /startindia) over
    // Firebase Auth's displayName, which is empty for email signups and
    // unreliable for some Google profiles.
    const displayName = q.firstName || payload.displayName || "";
    update.wp_user = {
      ID: payload.uid,
      user_email: payload.email ?? "",
      display_name: displayName,
      purchase_types: [],
    };

    // Email+password login in the app verifies against this encrypted field.
    if (payload.providerId === "password" && payload.password) {
      update.password = encryptPassword(payload.password);
    }

    // Quiz answers — write the app's field names so it doesn't re-ask.
    if (q.gender) update.selected_gender = q.gender;
    if (q.hairLossLocation) update.hair_loss_location = q.hairLossLocation;
    if (q.hairGoal) update.hair_goal = q.hairGoal;
    if (q.commitmentAnswer) update.commitment_answer = q.commitmentAnswer;
    if (q.supportNeeds) update.support_needs = q.supportNeeds;

    if (payload.referralSource && !existingData.referral_source) {
      update.referral_source = payload.referralSource;
    }
    if (payload.plan) update.plan = payload.plan;
    if (payload.paymentProvider) update.payment_provider = payload.paymentProvider;
    // paid_at = "most recent paid touch" (kept for backward compat).
    // first_paid_at = immutable timestamp of first-ever paid event — this
    // is the field that should be used for cohort/tenure analysis going forward.
    update.paid_at = FieldValue.serverTimestamp();
    if (!existingData.first_paid_at) {
      update.first_paid_at = FieldValue.serverTimestamp();
    }

    // Trial tagging — drives the Day-2 trial-end reminder email.
    // Only set trial_started_at on first paid call (immutable).
    if (payload.signupSource && !existingData.signup_source) {
      update.signup_source = payload.signupSource;
    }
    if (payload.trialDays && payload.trialDays > 0) {
      const nowMs = Date.now();
      if (!existingData.trial_started_at) {
        update.trial_started_at = FieldValue.serverTimestamp();
      }
      update.trial_ends_at = new Date(nowMs + payload.trialDays * 24 * 60 * 60 * 1000);
      update.trial_status = "active";
    }

    // If this user came through the lead funnel (phone captured pre-paywall),
    // mark the lead as converted so analytics can attribute correctly.
    update.lead_status = "converted";

    await docRef.set(update, { merge: true });

    // Write the immutable cohort snapshot on first paid — frozen demographics
    // and source attribution at the moment of first payment. Never modified.
    // This is the source of truth for "where did this customer come from and
    // what did they look like at signup?" — survives any future profile edits.
    if (isFirstWrite || !existingData.first_paid_at) {
      try {
        await db.collection("UserCohorts").doc(payload.uid).set(
          {
            uid: payload.uid,
            first_paid_at: FieldValue.serverTimestamp(),
            email: payload.email ?? null,
            signup_source: payload.signupSource ?? null,
            referral_source: payload.referralSource ?? null,
            plan_at_signup: payload.plan ?? null,
            payment_provider: payload.paymentProvider ?? null,
            gender: q.gender ?? null,
            hair_loss_location: q.hairLossLocation ?? null,
            hair_goal: q.hairGoal ?? null,
            commitment_answer: q.commitmentAnswer ?? null,
            support_needs: q.supportNeeds ?? [],
            treatments_tried: q.treatmentsTried ?? [],
            first_name: q.firstName ?? null,
            phone_number: q.phoneNumber ?? null,
            trial_days: payload.trialDays ?? 0,
          },
          { merge: false } // Hard write — only fires on first paid; never modified.
        );
      } catch (e) {
        // Don't fail the user write if cohort write fails — log only.
        // eslint-disable-next-line no-console
        console.error("[funnel/save-profile] UserCohorts write failed:", e);
      }
    }

    // Race-condition safety net for the RC alias.
    //
    // The web SDK's identifyUser is the primary path, the RC webhook is
    // the secondary path. This is the THIRD: if the RC webhook fired
    // BEFORE this user existed in Firestore (user paid, closed browser,
    // signed up later), the orphan was stored in PendingRcAliases. Pick
    // it up here now that the Firestore user exists, and alias the
    // anonymous RC customer to this Firebase UID server-side.
    if (payload.email) {
      try {
        const pending = await db
          .collection("PendingRcAliases")
          .where("email", "==", payload.email)
          .get();

        if (!pending.empty) {
          const rcKey = process.env.RC_API_SECRET_KEY;
          if (rcKey) {
            await Promise.all(
              pending.docs.map(async (doc) => {
                const data = doc.data();
                const anonAppUserId = data.anonAppUserId as string;
                try {
                  // /alias singular — /aliases plural returns 405. Same
                  // bug as in revenuecat/webhook/route.ts; both fixed
                  // together 2026-05-08 after Nicholas Tapp's account
                  // surfaced the issue.
                  const aliasResp = await fetch(
                    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(anonAppUserId)}/alias`,
                    {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${rcKey}`,
                        "Content-Type": "application/json",
                        "X-Platform": "stripe",
                      },
                      body: JSON.stringify({ new_app_user_id: payload.uid }),
                    }
                  );
                  if (aliasResp.ok) {
                    // eslint-disable-next-line no-console
                    console.log(
                      `[funnel/save-profile] AUTO_ALIAS recovered: anon=${anonAppUserId} → ${payload.uid} (email=${payload.email})`
                    );
                    // Clean up so we don't re-alias on subsequent calls.
                    await doc.ref.delete();
                  } else {
                    const body = await aliasResp.text().catch(() => "");
                    // eslint-disable-next-line no-console
                    console.error(
                      `[funnel/save-profile] AUTO_ALIAS failed for anon=${anonAppUserId}: status=${aliasResp.status} body=${body.slice(0, 200)}`
                    );
                  }
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.error(
                    `[funnel/save-profile] AUTO_ALIAS exception for anon=${anonAppUserId}:`,
                    e
                  );
                }
              })
            );
          }
        }
      } catch (e) {
        // Don't fail the user write if pending-alias check fails — log only.
        // eslint-disable-next-line no-console
        console.error("[funnel/save-profile] PendingRcAliases check failed:", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[funnel/save-profile] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown_error" },
      { status: 500 }
    );
  }
}
