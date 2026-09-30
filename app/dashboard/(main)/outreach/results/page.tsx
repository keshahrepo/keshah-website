import ResultsClient from "./ResultsClient";

export const dynamic = "force-dynamic";

export default function OutreachResultsPage() {
  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>
          Outreach results
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            margin: "4px 0 0",
            maxWidth: "62ch",
          }}
        >
          Texted → tapped the link → started a trial, per sender. Send links from the lead list
          so taps get recorded against the right person.
        </p>
      </header>
      <ResultsClient />
    </div>
  );
}
