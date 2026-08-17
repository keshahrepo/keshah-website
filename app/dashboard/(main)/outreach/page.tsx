import OutreachClient from "./OutreachClient";

export const dynamic = "force-dynamic";

export default function OutreachPage() {
  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>Personal outreach</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
          US non-buyers from the last 7 days. Tap a row to text from your phone.
        </p>
      </header>
      <OutreachClient />
    </div>
  );
}
