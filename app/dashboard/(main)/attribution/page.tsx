import AttributionClient from "./AttributionClient";

export const dynamic = "force-dynamic";

export default function AttributionPage() {
  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>Attribution</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
          New customers, trial starts, and paid conversion by referral source. Live from Firestore.
        </p>
      </header>
      <AttributionClient />
    </div>
  );
}
