// Returns the Stripe publishable key to the browser. PaymentStep on
// /start fetches this on mount so it can boot Stripe.js.
//
// The key is public (safe to expose — that's what "publishable" means).
// Reads STRIPE_PUBLISHABLE_KEY first (server-scoped), falls back to
// NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (inlined at build time) so the
// endpoint keeps working regardless of which env var Aadi has set.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const publishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
    null;

  if (!publishableKey) {
    return NextResponse.json(
      { ok: false, error: "stripe_publishable_key_not_configured" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, publishableKey });
}
