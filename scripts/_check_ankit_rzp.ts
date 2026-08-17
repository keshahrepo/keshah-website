// Search Razorpay for any sub/payment matching Ankit's email or phone.
// Usage: npx tsx scripts/_check_ankit_rzp.ts

const RZP_KEY = process.env.RAZORPAY_KEY_ID!;
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET!;
const AUTH = "Basic " + Buffer.from(`${RZP_KEY}:${RZP_SECRET}`).toString("base64");

const EMAIL = "shettyankit124@gmail.com";
const PHONE = "+919920096019";
const PHONE_DIGITS = "9920096019";

async function rzp(path: string) {
  const res = await fetch(`https://api.razorpay.com${path}`, {
    headers: { Authorization: AUTH },
  });
  return res.json() as any;
}

(async () => {
  console.log(`\n═══════════════ Razorpay search ═══════════════`);
  console.log(`  email: ${EMAIL}`);
  console.log(`  phone: ${PHONE} / ${PHONE_DIGITS}`);

  // Search subscriptions — RZP doesn't support filter by email/phone, scan
  // recent N pages
  console.log(`\n▸ Scanning subscriptions (last 500)...`);
  const matchSubs: any[] = [];
  for (let skip = 0; skip < 500; skip += 100) {
    const batch = await rzp(`/v1/subscriptions?count=100&skip=${skip}`);
    const items = batch.items || [];
    if (items.length === 0) break;
    for (const s of items) {
      if (
        s.customer_email?.toLowerCase() === EMAIL ||
        (s.customer_contact && s.customer_contact.includes(PHONE_DIGITS))
      ) {
        matchSubs.push(s);
      }
    }
    if (items.length < 100) break;
  }
  console.log(`  matches: ${matchSubs.length}`);
  for (const s of matchSubs) {
    console.log(`\n  ── sub ${s.id} ──`);
    console.log(`    status:        ${s.status}`);
    console.log(`    plan_id:       ${s.plan_id}`);
    console.log(`    paid_count:    ${s.paid_count}`);
    console.log(`    total_count:   ${s.total_count}`);
    console.log(`    email:         ${s.customer_email}`);
    console.log(`    contact:       ${s.customer_contact}`);
    console.log(`    notes:         ${JSON.stringify(s.notes)}`);
    console.log(`    created:       ${new Date((s.created_at ?? 0) * 1000).toISOString()}`);
    console.log(`    current_start: ${s.current_start ? new Date(s.current_start * 1000).toISOString() : "-"}`);
    console.log(`    current_end:   ${s.current_end ? new Date(s.current_end * 1000).toISOString() : "-"}`);
    console.log(`    charge_at:     ${s.charge_at ? new Date(s.charge_at * 1000).toISOString() : "-"}`);
    console.log(`    end_at:        ${s.end_at ? new Date(s.end_at * 1000).toISOString() : "-"}`);

    // Plan details
    if (s.plan_id) {
      const plan = await rzp(`/v1/plans/${s.plan_id}`);
      console.log(`    plan name:     ${plan.item?.name || "-"}`);
      console.log(`    plan amount:   ${plan.item?.amount} ${plan.item?.currency}`);
      console.log(`    plan period:   ${plan.period} x ${plan.interval}`);
    }
  }

  // Search payments (different namespace — capture any one-time payment too)
  console.log(`\n▸ Scanning payments (last 500)...`);
  const matchPays: any[] = [];
  for (let skip = 0; skip < 500; skip += 100) {
    const batch = await rzp(`/v1/payments?count=100&skip=${skip}`);
    const items = batch.items || [];
    if (items.length === 0) break;
    for (const p of items) {
      if (
        p.email?.toLowerCase() === EMAIL ||
        (p.contact && p.contact.includes(PHONE_DIGITS))
      ) {
        matchPays.push(p);
      }
    }
    if (items.length < 100) break;
  }
  console.log(`  matches: ${matchPays.length}`);
  for (const p of matchPays) {
    console.log(`\n  ── pay ${p.id} ──`);
    console.log(`    status:        ${p.status}`);
    console.log(`    amount:        ${p.amount/100} ${p.currency}`);
    console.log(`    method:        ${p.method}`);
    console.log(`    email:         ${p.email}`);
    console.log(`    contact:       ${p.contact}`);
    console.log(`    captured:      ${p.captured}`);
    console.log(`    description:   ${p.description}`);
    console.log(`    notes:         ${JSON.stringify(p.notes)}`);
    console.log(`    order_id:      ${p.order_id || "-"}`);
    console.log(`    sub_id:        ${p.subscription_id || "-"}`);
    console.log(`    created:       ${new Date((p.created_at ?? 0) * 1000).toISOString()}`);
    console.log(`    error_desc:    ${p.error_description || "-"}`);
  }

  // Look up customer by email to see if there's a customer record at all
  console.log(`\n▸ Customer search`);
  const customers = await rzp(`/v1/customers?email=${encodeURIComponent(EMAIL)}`);
  if (customers.items?.length) {
    for (const c of customers.items) {
      console.log(`  customer ${c.id}: ${c.email} ${c.contact} created=${new Date((c.created_at ?? 0)*1000).toISOString()}`);
    }
  } else {
    console.log(`  (no customer with that email)`);
  }
})();
