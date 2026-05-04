// Creates a Razorpay ONE-TIME ORDER for the regrowth kit (India).
//
// Mirrors /api/razorpay/create-order but uses orders API (one-time) not
// subscriptions API (recurring). Called by the mobile app's
// RazorpayCheckoutPage right before opening the Razorpay sheet.
//
// Output: { orderId, amount, currency, keyId } — passed straight into
// the Razorpay SDK on the device.

import { NextResponse } from "next/server";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// ₹24,000 = 2,400,000 paise. Hardcoded server-side so the client can't
// forge a cheaper amount.
const KIT_AMOUNT_PAISE = 2_400_000;
// Photo Hero — 20% off in exchange for sharing an honest review at
// month 4. ₹19,200 = 1,920,000 paise. Server enforces the exact discount
// (client just sends a flag, can't fake the amount).
const KIT_AMOUNT_PAISE_PHOTO_HERO = 1_920_000;
const KIT_CURRENCY = "INR";

export async function POST(req: Request) {
  try {
    const { uid, email, photoHeroOptIn } = (await req.json()) as {
      uid?: string;
      email?: string;
      photoHeroOptIn?: boolean;
    };

    if (!uid) {
      return NextResponse.json({ ok: false, error: "missing_uid" }, { status: 400 });
    }

    const amount = photoHeroOptIn ? KIT_AMOUNT_PAISE_PHOTO_HERO : KIT_AMOUNT_PAISE;

    const order = await razorpay.orders.create({
      amount,
      currency: KIT_CURRENCY,
      receipt: `kit_${uid}_${Date.now()}`,
      notes: {
        product: "regrowth_kit",
        uid,
        ...(email ? { email } : {}),
        ...(photoHeroOptIn ? { photo_hero: "true" } : {}),
        source: "mobile_india",
      },
    });

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID!,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[razorpay/kit/create-order]", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? JSON.stringify(err)
          : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
