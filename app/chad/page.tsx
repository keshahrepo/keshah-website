import StartFlow from "../start/components/StartFlow";

// Affiliate landing for Chad. Identical funnel as /start — the only
// difference is the URL, which SignUp reads via window.location.pathname
// to attribute the purchase (referral_source: "chad") in Firestore.
export default function ChadPage() {
  return <StartFlow />;
}
