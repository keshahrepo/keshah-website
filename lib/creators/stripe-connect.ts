/**
 * Creator payouts through Stripe Connect (Express accounts).
 *
 * The creator sets up payouts in Stripe's own hosted screens (bank login or
 * account numbers, identity check, W-9 / W-8BEN), so KESHAH never holds bank or
 * tax numbers. Paying an approved invoice is a Stripe transfer from the KESHAH
 * balance to the creator's account; Stripe then pays it out to their bank.
 *
 *   ContentCreators/{id}.stripe_account_id     acct_... (set once)
 *   ContentCreators/{id}.stripe                { status, bank_name, last4, country, checked_at }
 *
 * Switched on with CREATOR_PAYOUTS=stripe (otherwise the encrypted bank form stays).
 */
import Stripe from "stripe";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION, CreatorDataError } from "./db";

export type StripeStatus = "none" | "needs_info" | "pending" | "ready";

export interface StripeSummary {
  status: StripeStatus;
  bank_name: string | null;
  last4: string | null;
  country: string | null;
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.keshah.com";

export function stripePayoutsOn(): boolean {
  return process.env.CREATOR_PAYOUTS === "stripe" && !!process.env.STRIPE_SECRET_KEY;
}

let client: Stripe | null = null;
function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new CreatorDataError("Payouts aren't set up yet", 503);
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
  return client;
}

function ref(id: string) {
  return getFirebaseAdmin().db.collection(CREATORS_COLLECTION).doc(id);
}

/** Two-letter country code, or null. */
export function cleanCountry(v: unknown): string | null {
  const c = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

/** What the app shows, from a Stripe account. */
export function summarize(a: Pick<Stripe.Account, "details_submitted" | "payouts_enabled" | "requirements" | "external_accounts" | "country">): StripeSummary {
  const bank = (a.external_accounts?.data ?? []).find((x) => x.object === "bank_account") as Stripe.BankAccount | undefined;
  const due = (a.requirements?.currently_due?.length ?? 0) + (a.requirements?.past_due?.length ?? 0);
  const status: StripeStatus = a.payouts_enabled && due === 0 ? "ready" : !a.details_submitted || due > 0 ? "needs_info" : "pending";
  return { status, bank_name: bank?.bank_name ?? null, last4: bank?.last4 ?? null, country: a.country ?? null };
}

/** The creator's saved summary (no Stripe call). */
export function storedSummary(d: Record<string, unknown> | undefined): StripeSummary {
  const s = (d?.stripe ?? {}) as Partial<StripeSummary>;
  if (!d?.stripe_account_id) return { status: "none", bank_name: null, last4: null, country: null };
  return { status: s.status ?? "needs_info", bank_name: s.bank_name ?? null, last4: s.last4 ?? null, country: s.country ?? null };
}

/** Fresh status from Stripe, saved on the creator. "none" when they haven't started. */
export async function refreshStripeStatus(id: string): Promise<StripeSummary> {
  const snap = await ref(id).get();
  const acct = snap.data()?.stripe_account_id as string | undefined;
  if (!acct) return storedSummary(undefined);
  const a = await stripe().accounts.retrieve(acct);
  const sum = summarize(a);
  await ref(id).set({ stripe: { ...sum, checked_at: new Date().toISOString() } }, { merge: true });
  return sum;
}

/**
 * A Stripe onboarding link for the creator, creating their Express account on
 * first use. Non-US creators get Stripe's cross-border "recipient" agreement.
 */
export async function onboardingLink(id: string, countryIn: unknown): Promise<string> {
  const snap = await ref(id).get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const d = snap.data()!;
  let acct = d.stripe_account_id as string | undefined;
  if (!acct) {
    const country = cleanCountry(countryIn) ?? "US";
    const a = await stripe().accounts.create(
      {
        type: "express",
        country,
        email: String(d.email || "") || undefined,
        business_type: "individual",
        capabilities: { transfers: { requested: true } },
        ...(country === "US" ? {} : { tos_acceptance: { service_agreement: "recipient" } }),
        settings: { payouts: { schedule: { interval: "daily" } } },
        metadata: { creator_id: id },
      },
      { idempotencyKey: `creator-acct-${id}` },
    );
    acct = a.id;
    await ref(id).set({ stripe_account_id: acct, stripe: { ...summarize(a), checked_at: new Date().toISOString() } }, { merge: true });
  }
  const link = await stripe().accountLinks.create({
    account: acct,
    type: "account_onboarding",
    refresh_url: `${SITE}/creator/payouts?again=1`,
    return_url: `${SITE}/creator/payouts?done=1`,
  });
  return link.url;
}

/** Pays an approved invoice: one transfer per invoice (idempotent). Returns the transfer id. */
export async function transferInvoice(id: string, number: string, amountCents: number): Promise<string> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new CreatorDataError("Nothing to pay on this invoice", 409);
  const sum = await refreshStripeStatus(id);
  if (sum.status !== "ready") throw new CreatorDataError("This creator hasn't finished Stripe payouts setup", 409);
  const acct = (await ref(id).get()).data()!.stripe_account_id as string;
  const t = await stripe().transfers.create(
    {
      amount: amountCents,
      currency: "usd",
      destination: acct,
      transfer_group: `invoice-${id}-${number}`,
      description: `KESHAH creator invoice ${number}`,
      metadata: { creator_id: id, invoice: number },
    },
    { idempotencyKey: `invoice-transfer-${id}-${number}` },
  );
  return t.id;
}
