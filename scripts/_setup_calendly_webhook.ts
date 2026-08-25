// One-time setup: subscribe our /api/hooks/calendly endpoint to
// Calendly's `invitee.created` events. Idempotent — lists existing
// subscriptions first and only creates if the target URL isn't already
// subscribed. Prints every subscription's state at the end so the
// wiring is auditable.
//
// Reads the Calendly PAT from Settings/app_general_settings.calendly_token
// so we don't hardcode credentials in the script.
//
// If CALENDLY_WEBHOOK_SECRET is set on Vercel, the webhook route
// enforces `?secret=...` on incoming requests — we mirror that into
// the subscription URL so Calendly sends it back on every event.

import { getFirebaseAdmin } from "../lib/firebase-admin";

const WEBHOOK_URL_BASE = "https://www.keshah.com/api/hooks/calendly";
const CALENDLY_API = "https://api.calendly.com";

// Calendly's PAT actually authorizes at the user level; to subscribe
// to org-level events we need to know the user's URI first, then their
// current organization URI. Two `/me` -> `/organization_memberships`
// hops.
async function callCalendly(path: string, token: string, init: RequestInit = {}) {
  const resp = await fetch(`${CALENDLY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(`Calendly ${init.method ?? "GET"} ${path} → ${resp.status}: ${body.slice(0, 400)}`);
  }
  return body ? JSON.parse(body) : {};
}

async function main() {
  const { db } = getFirebaseAdmin();

  const settingsSnap = await db.doc("Settings/app_general_settings").get();
  const token = settingsSnap.data()?.calendly_token as string | undefined;
  if (!token) {
    console.error("No calendly_token on Settings/app_general_settings");
    process.exit(1);
  }
  console.log(`Using calendly_token (${token.slice(0, 8)}…)`);

  // 1. Resolve user URI + org URI.
  const me = (await callCalendly("/users/me", token)) as {
    resource: { uri: string; current_organization: string; email: string };
  };
  const userUri = me.resource.uri;
  const orgUri = me.resource.current_organization;
  console.log(`\nCalendly account: ${me.resource.email}`);
  console.log(`  user_uri:  ${userUri}`);
  console.log(`  org_uri:   ${orgUri}`);

  // 2. Check for the webhook secret in Vercel env — we can't read it
  // directly, but the user set it on the RC side too, so surface both
  // paths so they know which URL to expect Calendly to POST to.
  const secret = process.env.CALENDLY_WEBHOOK_SECRET;
  const targetUrl = secret ? `${WEBHOOK_URL_BASE}?secret=${secret}` : WEBHOOK_URL_BASE;
  console.log(`\nTarget webhook URL Calendly will POST to:\n  ${targetUrl}`);
  if (!secret) {
    console.log(
      `  (No CALENDLY_WEBHOOK_SECRET in local env — webhook route accepts unauthenticated requests\n` +
      `   unless the env var is set on Vercel. If it IS set on Vercel, re-run this script with\n` +
      `   CALENDLY_WEBHOOK_SECRET=xxx to include the secret in the subscription URL.)`
    );
  }

  // 3. List current subscriptions at both user and org scope.
  console.log(`\n── Existing subscriptions at ORGANIZATION scope ──`);
  const orgSubs = (await callCalendly(
    `/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&scope=organization`,
    token
  )) as { collection: Array<{ uri: string; callback_url: string; events: string[]; state: string }> };
  if (orgSubs.collection.length === 0) console.log("  (none)");
  for (const sub of orgSubs.collection) {
    console.log(`  ${sub.state.padEnd(8)}  ${sub.events.join(",").padEnd(30)}  → ${sub.callback_url}`);
  }

  console.log(`\n── Existing subscriptions at USER scope ──`);
  const userSubs = (await callCalendly(
    `/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&user=${encodeURIComponent(userUri)}&scope=user`,
    token
  )) as { collection: Array<{ uri: string; callback_url: string; events: string[]; state: string }> };
  if (userSubs.collection.length === 0) console.log("  (none)");
  for (const sub of userSubs.collection) {
    console.log(`  ${sub.state.padEnd(8)}  ${sub.events.join(",").padEnd(30)}  → ${sub.callback_url}`);
  }

  // 4. Idempotency: if the base URL is already subscribed to
  // invitee.created (regardless of query-string secret) at USER scope,
  // do nothing. We subscribe at USER scope because all the relevant
  // event types (regrowth-consultation, regrowth-consultation-clone
  // aka onboarding call) are owned by the single Calendly user.
  const alreadySubscribed = userSubs.collection.some((sub) => {
    const baseMatches = sub.callback_url.startsWith(WEBHOOK_URL_BASE);
    const hasInviteeCreated = sub.events.includes("invitee.created");
    const isActive = sub.state === "active";
    return baseMatches && hasInviteeCreated && isActive;
  });

  if (alreadySubscribed) {
    console.log(
      `\n✓ Already subscribed to invitee.created for ${WEBHOOK_URL_BASE} at USER scope. Nothing to do.`
    );
    return;
  }

  console.log(`\n→ Creating USER-scope subscription for invitee.created…`);
  const created = (await callCalendly("/webhook_subscriptions", token, {
    method: "POST",
    body: JSON.stringify({
      url: targetUrl,
      events: ["invitee.created"],
      organization: orgUri,
      user: userUri,
      scope: "user",
    }),
  })) as { resource: { uri: string; callback_url: string; events: string[]; state: string } };

  console.log(`\n✓ Subscription created:`);
  console.log(`  uri:          ${created.resource.uri}`);
  console.log(`  callback_url: ${created.resource.callback_url}`);
  console.log(`  events:       ${created.resource.events.join(", ")}`);
  console.log(`  state:        ${created.resource.state}`);
  console.log(
    `\nNext booking on any of Aadi's Calendly event types will POST to our webhook.` +
    `\nAfter one test booking, re-run scripts/_check_onboarding_call.ts to confirm the write.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
