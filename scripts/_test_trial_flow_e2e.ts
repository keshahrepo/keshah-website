// End-to-end test of the web trial flow.
//
// What it does:
//   1. Calls our production /api/stripe/create-subscription to get a
//      Checkout Session URL (verifies the client-facing API works).
//   2. Directly creates a real Stripe subscription with our trial price
//      (no charge — trial_period_days: 7 → $0 due today). This mirrors
//      what completing the hosted checkout would do — same webhook fires.
//   3. Waits for our webhook to fire + process (customer.subscription
//      .created → seed Firestore + mint custom token + PendingClaims write
//      + RC /v1/receipts).
//   4. Polls Firestore for the seeded User doc + PendingClaims record.
//   5. Polls RC for the subscriber entitlement.
//   6. Reports pass/fail on each step.
//   7. Cleans up: cancels the Stripe subscription immediately.
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_test_trial_flow_e2e.ts

import Stripe from "stripe";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any,
});

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const PROD_URL = "https://www.keshah.com";
// Look up the trial price by its lookup_key so this script works
// without STRIPE_TRIAL_PRICE_ID being in .env.local (it lives in Vercel).
async function resolvePriceId(): Promise<string> {
  if (process.env.STRIPE_TRIAL_PRICE_ID) return process.env.STRIPE_TRIAL_PRICE_ID;
  const prices = await stripe.prices.list({
    lookup_keys: ["keshah_trial_3mo_usd"],
    active: true,
    limit: 1,
  });
  if (prices.data[0]) return prices.data[0].id;
  throw new Error("No trial price found by lookup_key keshah_trial_3mo_usd");
}
const TEST_EMAIL = `e2e-${Date.now()}@keshah-e2e.test`;

// Colours for terminal output
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const B = (s: string) => `\x1b[34m${s}\x1b[0m`;

function ms(): number {
  return Date.now();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function step<T>(
  name: string,
  fn: () => Promise<{ ok: boolean; detail: string; data?: T }>,
): Promise<{ ok: boolean; data?: T }> {
  const t0 = ms();
  process.stdout.write(`  ${B("▸")} ${name}… `);
  try {
    const r = await fn();
    const dur = `${((ms() - t0) / 1000).toFixed(1)}s`;
    console.log(
      r.ok
        ? `${G("✓")} ${r.detail} ${Y(`(${dur})`)}`
        : `${R("✗")} ${r.detail} ${Y(`(${dur})`)}`,
    );
    return { ok: r.ok, data: r.data };
  } catch (e) {
    console.log(`${R("✗")} threw: ${(e as Error).message}`);
    return { ok: false };
  }
}

(async () => {
  const TRIAL_PRICE_ID = await resolvePriceId();
  console.log(`\n${B("━━━ Trial flow E2E test ━━━")}\n`);
  console.log(`  Test email: ${TEST_EMAIL}`);
  console.log(`  Price ID:   ${TRIAL_PRICE_ID}\n`);

  // Step 1: verify /api/stripe/create-subscription returns a URL
  const s1 = await step("POST /api/stripe/create-subscription", async () => {
    const res = await fetch(`${PROD_URL}/api/stripe/create-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quizAnswers: {
          gender: "male",
          hair_goal: "stop_the_loss",
          hair_loss_location: "hairline",
        },
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      url?: string;
      sessionId?: string;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.url) {
      return { ok: false, detail: `status=${res.status} err=${data.error}` };
    }
    return {
      ok: true,
      detail: `returned Stripe URL (${data.sessionId?.slice(0, 20)}...)`,
      data,
    };
  });
  if (!s1.ok) return process.exit(1);

  // Step 2: create a real Stripe subscription with trial (simulates what
  // completing the hosted checkout would do — same webhook fires).
  let subscriptionId: string | null = null;
  let customerId: string | null = null;
  const s2 = await step(
    "Create Stripe subscription (trial, no charge)",
    async () => {
      const customer = await stripe.customers.create({
        email: TEST_EMAIL,
        metadata: { source: "e2e_test" },
      });
      customerId = customer.id;
      const sub = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: TRIAL_PRICE_ID }],
        trial_period_days: 7,
        trial_settings: {
          end_behavior: { missing_payment_method: "cancel" },
        },
        metadata: {
          source: "web_onboarding_paywall",
          gender: "male",
          hair_goal: "stop_the_loss",
          hair_loss_location: "hairline",
          trial_days: "7",
        },
      });
      subscriptionId = sub.id;
      return {
        ok: sub.status === "trialing" || sub.status === "active",
        detail: `${sub.id}  status=${sub.status}`,
      };
    },
  );
  if (!s2.ok) return process.exit(1);

  // Step 3: wait for webhook to fire + process
  console.log(`  ${Y("⏳")} waiting 15s for webhook…`);
  await sleep(15000);

  // Step 4: find the Firebase user by email (webhook created it)
  const s4 = await step(
    "Firebase user exists (created by webhook)",
    async () => {
      const { getAuth } = await import("firebase-admin/auth");
      const authInstance = getAuth();
      try {
        const user = await authInstance.getUserByEmail(TEST_EMAIL);
        return { ok: true, detail: `uid=${user.uid}`, data: user.uid };
      } catch (e) {
        return {
          ok: false,
          detail: `no Firebase user for ${TEST_EMAIL}`,
        };
      }
    },
  );
  if (!s4.ok) return cleanup();
  const uid = s4.data as string;

  // Step 5: Firestore User doc seeded
  await step("Firestore Users/<uid> seeded", async () => {
    const snap = await db.collection("Users").doc(uid).get();
    if (!snap.exists) return { ok: false, detail: "doc missing" };
    const d = snap.data() ?? {};
    const req = [
      "user_type",
      "treatment_stage",
      "extra_user_tags",
      "starter_photos_submit_submitted_once",
      "start_date",
      "email",
    ];
    const missing = req.filter((k) => !(k in d));
    if (missing.length > 0) {
      return { ok: false, detail: `missing fields: ${missing.join(",")}` };
    }
    return {
      ok: true,
      detail: `${req.length} fields present · user_type=${d.user_type} tags=${JSON.stringify(d.extra_user_tags)}`,
    };
  });

  // Step 6: PendingClaims record with custom token
  await step("PendingClaims/<checkout_session_id> has token", async () => {
    // Look up the checkout session tied to this subscription.
    const sessions = await stripe.checkout.sessions.list({
      subscription: subscriptionId!,
      limit: 1,
    });
    const checkoutSessionId = sessions.data[0]?.id ?? subscriptionId!;
    const snap = await db
      .collection("PendingClaims")
      .doc(checkoutSessionId)
      .get();
    if (!snap.exists) {
      return { ok: false, detail: `no PendingClaims/${checkoutSessionId}` };
    }
    const d = snap.data() ?? {};
    const hasToken =
      typeof d.custom_token === "string" && d.custom_token.length > 100;
    return {
      ok: hasToken,
      detail: hasToken
        ? `token ${(d.custom_token as string).slice(0, 20)}… uid=${d.uid}`
        : `token missing/short`,
    };
  });

  // Step 7: RC subscriber has entitlement
  await step("RC subscriber has stoppage_treatment entitlement", async () => {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${RC_KEY}` } },
    );
    if (!res.ok) return { ok: false, detail: `RC GET ${res.status}` };
    const body = (await res.json()) as {
      subscriber?: {
        entitlements?: Record<string, { expires_date?: string | null }>;
      };
    };
    const ent = body.subscriber?.entitlements ?? {};
    const stoppage = ent["stoppage_treatment"];
    if (!stoppage) {
      return {
        ok: false,
        detail: `no entitlement (found: ${Object.keys(ent).join(",") || "(none)"})`,
      };
    }
    return {
      ok: true,
      detail: `active · expires=${stoppage.expires_date ?? "(never)"}`,
    };
  });

  await cleanup();
  async function cleanup() {
    console.log(`\n${B("━━━ Cleanup ━━━")}`);
    if (subscriptionId) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
        console.log(`  ${G("✓")} cancelled ${subscriptionId}`);
      } catch (e) {
        console.log(`  ${R("✗")} cancel failed: ${(e as Error).message}`);
      }
    }
    if (customerId) {
      try {
        await stripe.customers.del(customerId);
        console.log(`  ${G("✓")} deleted customer ${customerId}`);
      } catch (e) {
        console.log(`  ${Y("!")} customer delete: ${(e as Error).message}`);
      }
    }
    console.log("");
    process.exit(0);
  }
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
