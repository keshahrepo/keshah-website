import NurtureClient from "./NurtureClient";

export const dynamic = "force-dynamic";

export default function NurturePage() {
  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>Nurture</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
          Email + SMS drip performance. Sends, opens, clicks, conversions, revenue attributed.
        </p>
      </header>
      <NurtureClient />
    </div>
  );
}
