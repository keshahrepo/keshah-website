import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

async function main() {
  const priceId = "price_1U8NBnAx4l3WR2mPFoTCoS9J";
  const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
  console.log(JSON.stringify(price, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
