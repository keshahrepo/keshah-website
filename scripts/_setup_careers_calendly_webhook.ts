// Subscribe the group-interview webhook (/api/careers/calendly-webhook) to
// BOTH invitee.created and invitee.canceled, with a signing key.
//
// Calendly can't edit a subscription's events or key, so this creates a new
// subscription and then deletes the old one(s) for the same URL. The new one
// gets a harmless ?v=... on the URL (the route ignores it) because Calendly
// refuses two subscriptions with the exact same URL, and creating first means
// no booking is missed in between.
//
//   Dry run (lists what's there, changes nothing):
//     npx tsx scripts/_setup_careers_calendly_webhook.ts
//   Apply:
//     CALENDLY_WEBHOOK_SIGNING_KEY=<random secret> npx tsx scripts/_setup_careers_calendly_webhook.ts --apply
//
// Then put the SAME key in Vercel (Production) as CALENDLY_WEBHOOK_SIGNING_KEY
// and redeploy. Until that deploy, the endpoint accepts unsigned events, so
// nothing is lost in between.
//
// Reads the Calendly token from Settings/app_general_settings.calendly_token
// (same as scripts/_setup_calendly_webhook.ts). Reads Firestore only.

import { getFirebaseAdmin } from "../lib/firebase-admin";

const TARGET = "https://www.keshah.com/api/careers/calendly-webhook";
const EVENTS = ["invitee.created", "invitee.canceled"];
const API = "https://api.calendly.com";

type Sub = { uri: string; callback_url: string; events: string[]; state: string; scope: string };

async function call(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Calendly ${init.method ?? "GET"} ${path} → ${res.status}: ${body.slice(0, 400)}`);
  return body ? JSON.parse(body) : {};
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { db } = getFirebaseAdmin();
  const token = (await db.doc("Settings/app_general_settings").get()).get("calendly_token") as string | undefined;
  if (!token) throw new Error("No calendly_token on Settings/app_general_settings");

  const me = (await call("/users/me", token)) as { resource: { uri: string; current_organization: string; email: string } };
  const user = me.resource.uri;
  const org = me.resource.current_organization;
  console.log(`Calendly account: ${me.resource.email}`);

  const list = async (scope: "user" | "organization"): Promise<Sub[]> => {
    const q = `organization=${encodeURIComponent(org)}&scope=${scope}${scope === "user" ? `&user=${encodeURIComponent(user)}` : ""}`;
    const r = (await call(`/webhook_subscriptions?${q}`, token)) as { collection: Sub[] };
    return r.collection;
  };
  const subs = [...(await list("user")), ...(await list("organization"))];
  const ours = subs.filter((x) => x.callback_url.split("?")[0] === TARGET);
  console.log(`\nSubscriptions for ${TARGET}:`);
  if (!ours.length) console.log("  (none)");
  for (const x of ours) console.log(`  ${x.state.padEnd(8)} ${x.scope.padEnd(12)} ${x.events.join(",")}  ${x.uri}`);

  if (!apply) {
    console.log("\nDry run. Re-run with CALENDLY_WEBHOOK_SIGNING_KEY=... and --apply to replace them.");
    return;
  }
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY ?? "";
  if (key.length < 16) throw new Error("Set CALENDLY_WEBHOOK_SIGNING_KEY (16+ characters) to the key you'll also put in Vercel.");

  const created = (await call("/webhook_subscriptions", token, {
    method: "POST",
    body: JSON.stringify({ url: `${TARGET}?v=${Date.now().toString(36)}`, events: EVENTS, organization: org, user, scope: "user", signing_key: key }),
  })) as { resource: Sub };
  console.log(`\nCreated: ${created.resource.uri} (${created.resource.events.join(", ")}, ${created.resource.state})`);

  for (const x of ours) {
    await call(`/webhook_subscriptions/${x.uri.split("/").pop()}`, token, { method: "DELETE" });
    console.log(`Deleted old: ${x.uri}`);
  }
  console.log("\nNow set CALENDLY_WEBHOOK_SIGNING_KEY in Vercel (Production) to the same key and redeploy.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
