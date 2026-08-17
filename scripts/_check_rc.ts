// Inspect a user's RevenueCat subscriber state via REST API. Useful for
// verifying whether web-billing aliased correctly + whether the SDK
// would see the subscription on mobile.
//
// Usage: npx tsx scripts/_check_rc.ts <appUserId>
//   appUserId = the Firebase UID

const KEY = process.env.RC_API_SECRET_KEY!;

async function main() {
  const uid = (process.argv[2] ?? "").trim();
  if (!uid) {
    console.error("Usage: _check_rc.ts <appUserId>");
    process.exit(1);
  }
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
