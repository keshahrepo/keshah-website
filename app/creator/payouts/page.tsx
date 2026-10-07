// Where Stripe sends a creator back after payouts setup (return_url / refresh_url).
// They're in the in-app browser: tell them to close it; the app refreshes on return.
export const metadata = { title: "Payouts | KESHAH" };

export default async function PayoutsReturn({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const again = (await searchParams).again === "1";
  return (
    <main style={{ minHeight: "100vh", background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 360, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: "0 0 12px" }}>{again ? "Link expired" : "You're all set"}</h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,0.6)", margin: 0 }}>
          {again ? "Close this page and tap Set up payouts again." : "Close this page to go back to the app."}
        </p>
      </div>
    </main>
  );
}
