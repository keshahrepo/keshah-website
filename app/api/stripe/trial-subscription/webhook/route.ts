// Stripe webhook for the WEB trial-purchase flow (FreeV2 paidStoppage).
//
// Distinct from /api/stripe/subscription/webhook — that one is for the
// Regrowth Kit subscription. This one handles the paywall trial purchase
// that the mobile app deep-links into via /app/claim?ft=<customToken>.
//
// Events we act on:
//
//   customer.subscription.created — user just completed Stripe Checkout /
//     Payment Element. Seed Users/<uid> with the exact FreeV2 paidStoppage
//     shape (mirrors /api/funnel/save-profile so mobile splash treats them
//     as onboarded), mint a Firebase custom token, stash it in
//     PendingClaims/<sessionId> so the success page can hand it off to the
//     app via universal link.
//
//   invoice.paid — first paid invoice after the trial elapses. Marks
//     subscription_active_at so we can distinguish "still in trial" from
//     "trial converted".
//
//   customer.subscription.deleted / .updated (cancelled) — marks
//     trial_cancelled_at.
//
// SETUP:
//   Stripe Dashboard → Developers → Webhooks → Add endpoint:
//     URL:     https://www.keshah.com/api/stripe/trial-subscription/webhook
//     Events:  customer.subscription.created, invoice.paid,
//              customer.subscription.deleted, customer.subscription.updated
//   Copy the signing secret into STRIPE_TRIAL_WEBHOOK_SECRET in Vercel env.
//
// REQUIRED ENV VARS:
//   STRIPE_SECRET_KEY               (already set)
//   STRIPE_TRIAL_WEBHOOK_SECRET     (NEW — signing secret for this endpoint)
//   FIREBASE_SERVICE_ACCOUNT        (already set; must have the
//                                    "Service Account Token Creator" role
//                                    on the service account for
//                                    auth.createCustomToken() to work)

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";
// Ensure raw body is available for signature verification.
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

// Custom-token TTL that Firebase enforces on createCustomToken output.
// Not configurable — surfaced here as a constant so the PendingClaims
// expiry we write to Firestore matches what the mobile app will actually
// be able to redeem.
const CUSTOM_TOKEN_TTL_SECONDS = 3600;

// start_date shape the mobile app's userDay calc expects. Date must be
// dd/MM/yyyy, time must be hh:mm AM/PM (zero-padded hour, uppercase
// meridiem). Mirrors buildStartDate() in /api/funnel/save-profile.
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

// Look up the Stripe Checkout Session ID that produced this subscription.
// The success page keys PendingClaims by session_id (that's what the URL
// carries), so we need it to write the token under a key the page can
// find. Returns null if this sub wasn't created via Checkout — the caller
// falls back to subscription.id.
async function findCheckoutSessionId(
  subscriptionId: string,
): Promise<string | null> {
  try {
    const list = await stripe.checkout.sessions.list({
      subscription: subscriptionId,
      limit: 1,
    });
    return list.data[0]?.id ?? null;
  } catch (err) {
    console.error(
      "[stripe/trial-subscription/webhook] checkout session lookup failed:",
      err,
    );
    return null;
  }
}

export async function POST(req: Request) {
  const signingSecret = process.env.STRIPE_TRIAL_WEBHOOK_SECRET;
  if (!signingSecret) {
    return NextResponse.json(
      { ok: false, error: "webhook_secret_not_configured" },
      { status: 500 },
    );
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { ok: false, error: "missing_signature" },
      { status: 400 },
    );
  }
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, signingSecret);
  } catch (err) {
    console.error(
      "[stripe/trial-subscription/webhook] signature verify failed:",
      err,
    );
    return NextResponse.json(
      { ok: false, error: "invalid_signature" },
      { status: 400 },
    );
  }

  const { db, auth } = getFirebaseAdmin();

  try {
    switch (event.type) {
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const md = sub.metadata ?? {};
        const uid = md.uid;
        if (!uid) {
          console.error(
            "[stripe/trial-subscription/webhook] subscription.created missing uid metadata",
            sub.id,
          );
          break;
        }

        // Pull email from the Stripe Customer object — metadata.email is
        // a nice-to-have but the customer object is the source of truth.
        let customerEmail: string | null = md.email || null;
        try {
          const customerId =
            typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
          if (customerId) {
            const customer = await stripe.customers.retrieve(customerId);
            if (customer && !("deleted" in customer && customer.deleted)) {
              customerEmail =
                (customer as Stripe.Customer).email ?? customerEmail;
            }
          }
        } catch (e) {
          console.error(
            "[stripe/trial-subscription/webhook] customer lookup failed:",
            e,
          );
        }

        // Timezone — fall back to Asia/Kolkata + IST offset to match the
        // funnel/save-profile behaviour when the client didn't send one.
        const timezone =
          typeof md.timezone === "string" && md.timezone
            ? md.timezone
            : "Asia/Kolkata";
        const timezoneOffsetInMins = md.timezone_offset_mins
          ? Number.parseInt(md.timezone_offset_mins, 10) || 330
          : 330;

        const trialDays = md.trial_days
          ? Number.parseInt(md.trial_days, 10) || 0
          : 0;

        // Read existing user doc — gates first-write-only fields
        // (created_at, first_paid_at, start_date, trial_started_at,
        // signup_source) so a webhook retry doesn't overwrite cohort data.
        const userRef = db.collection("Users").doc(uid);
        const snap = await userRef.get();
        const existing = snap.exists ? snap.data() ?? {} : {};

        const update: Record<string, unknown> = {
          // Paid FreeV2 state — exact mirror of save-profile. The
          // discriminator that flags "this user is paid" for the mobile
          // splash is `extra_user_tags: ["paidStoppage"]`, NOT user_type
          // or treatment_stage.
          user_type: "freev2",
          treatment_stage: "FREE_STOPPAGE",
          extra_user_tags: ["paidStoppage"],
          eligible_for_special_regrowth_features: true,

          // Onboarding-complete flags — makes splash skip the app's
          // gender / starter-photos / paywall screens and route direct
          // to dashboard.
          starter_photos_submit_showed_once: true,
          starter_photos_submit_submitted_once: true,

          userLocalTimeZone: timezone,
          onboarding_flow_version: "B",
          is_deleted: false,

          email: customerEmail ?? null,
          providerId: md.providerId ?? null,

          payment_provider: "stripe",
          lead_status: "converted",

          // paid_at = "most recent paid touch" (kept for backward compat).
          paid_at: FieldValue.serverTimestamp(),
          modified_at: FieldValue.serverTimestamp(),
        };

        // wp_user nested object — LoginBloc queries wp_user.user_email,
        // WPUserItem.fromJson reads ID (uppercase), user_email,
        // display_name, purchase_types.
        const displayName = md.first_name || "";
        update.wp_user = {
          ID: uid,
          user_email: customerEmail ?? "",
          display_name: displayName,
          purchase_types: [],
        };

        // Quiz answers written under the app's field names so mobile
        // doesn't re-ask on splash.
        if (md.gender) update.selected_gender = md.gender;
        if (md.hair_loss_location) update.hair_loss_location = md.hair_loss_location;
        if (md.hair_goal) update.hair_goal = md.hair_goal;
        if (md.commitment_answer) update.commitment_answer = md.commitment_answer;
        if (md.support_needs) {
          // support_needs came through metadata as a comma-separated
          // string (Stripe metadata values are strings). Split back to
          // an array so the app's UserModel parser is happy.
          update.support_needs = md.support_needs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }

        if (md.plan_key) update.plan = md.plan_key;
        if (md.signup_source && !existing.signup_source) {
          update.signup_source = md.signup_source;
        }
        if (md.referral_source && !existing.referral_source) {
          update.referral_source = md.referral_source;
        }

        // Immutable first-time fields — set ONCE per uid.
        if (!existing.created_at) {
          update.created_at = FieldValue.serverTimestamp();
        }
        if (!existing.first_paid_at) {
          update.first_paid_at = FieldValue.serverTimestamp();
        }
        if (!existing.start_date) {
          update.start_date = buildStartDate(
            new Date(),
            timezone,
            timezoneOffsetInMins,
          );
        }

        // Trial tagging — drives the trial-end reminder email.
        if (trialDays > 0) {
          if (!existing.trial_started_at) {
            update.trial_started_at = FieldValue.serverTimestamp();
          }
          update.trial_ends_at = new Date(
            Date.now() + trialDays * 24 * 60 * 60 * 1000,
          );
          update.trial_status = "active";
        }

        await userRef.set(update, { merge: true });

        // Mint a Firebase custom token for the deep-link handoff. The
        // mobile /app/claim page redeems this with signInWithCustomToken
        // so the user lands on their onboarded dashboard without a
        // manual login. Firebase enforces a 1-hour TTL on custom tokens
        // — the success page must open the deep link promptly.
        //
        // { source: "web_paid" } is stamped into the resulting ID
        // token's claims so the app can distinguish deep-link
        // logins from organic auth.
        let customToken: string;
        try {
          customToken = await auth.createCustomToken(uid, {
            source: "web_paid",
          });
        } catch (err) {
          // If token minting fails (usually because the service account
          // lacks the "Service Account Token Creator" role), return 500
          // so Stripe retries — user has already paid, we must not drop
          // this event silently.
          console.error(
            "[stripe/trial-subscription/webhook] createCustomToken failed:",
            err,
          );
          return NextResponse.json(
            { ok: false, error: "custom_token_mint_failed" },
            { status: 500 },
          );
        }

        // Stash the token in PendingClaims/<sessionId>. Success page
        // reads by Stripe checkout session ID (which is what its URL
        // carries). Fall back to subscription.id if this sub didn't
        // come from Checkout (e.g. Payment Element flow, in which case
        // the client passes subscription.id explicitly).
        const checkoutSessionId = await findCheckoutSessionId(sub.id);
        const claimKey = checkoutSessionId ?? sub.id;
        const expiresAt = Timestamp.fromMillis(
          Date.now() + CUSTOM_TOKEN_TTL_SECONDS * 1000,
        );

        // Never log the token — treat like a bearer credential.
        await db.collection("PendingClaims").doc(claimKey).set(
          {
            uid,
            custom_token: customToken,
            expires_at: expiresAt,
            subscription_id: sub.id,
            checkout_session_id: checkoutSessionId,
            created_at: FieldValue.serverTimestamp(),
          },
          { merge: false },
        );

        break;
      }

      case "invoice.paid": {
        // First paid invoice after the trial elapses. Trial-created
        // sends invoice.paid too (with amount_paid=0 for trials);
        // guard on billing_reason so we only stamp subscription_active_at
        // when it's a real paid conversion.
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;
        if (!subscriptionId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const uid = sub.metadata?.uid;
        if (!uid) break;

        const isTrialInvoice = invoice.billing_reason === "subscription_create"
          && invoice.amount_paid === 0;
        if (isTrialInvoice) break;

        const userRef = db.collection("Users").doc(uid);
        const snap = await userRef.get();
        const existing = snap.exists ? snap.data() ?? {} : {};

        const updates: Record<string, unknown> = {
          modified_at: FieldValue.serverTimestamp(),
        };
        if (!existing.subscription_active_at) {
          updates.subscription_active_at = FieldValue.serverTimestamp();
        }
        // Trial converted — flip status so the reminder-email query
        // stops matching this user.
        if (existing.trial_status === "active") {
          updates.trial_status = "converted";
        }
        await userRef.set(updates, { merge: true });
        break;
      }

      case "customer.subscription.deleted":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const isCancelled =
          event.type === "customer.subscription.deleted" ||
          sub.status === "canceled" ||
          sub.cancel_at_period_end === true;
        if (!isCancelled) break;

        const uid = sub.metadata?.uid;
        if (!uid) break;

        await db.collection("Users").doc(uid).set(
          {
            trial_cancelled_at: sub.canceled_at
              ? Timestamp.fromMillis(sub.canceled_at * 1000)
              : FieldValue.serverTimestamp(),
            trial_status: "cancelled",
            subscription_cancel_at_period_end: sub.cancel_at_period_end,
            modified_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        break;
      }

      default:
        // Ack unknown events so Stripe stops retrying.
        break;
    }
  } catch (err) {
    console.error(
      `[stripe/trial-subscription/webhook] handler error for ${event.type}:`,
      err,
    );
    // Return 500 so Stripe retries.
    return NextResponse.json(
      { ok: false, error: "handler_error" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, event_type: event.type });
}
