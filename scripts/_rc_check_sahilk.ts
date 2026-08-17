const RC_KEY = process.env.RC_API_SECRET_KEY!;
const UID = "D74CygFhJjRMGF9eZwAm6VnFYDi2";

// v1 legacy subscriber endpoint — matches the key we have.
(async () => {
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(UID)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${RC_KEY}` } });
  console.log(`HTTP ${res.status}`);
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
})();
