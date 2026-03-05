import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KESHAH — Scan in App",
};

export default function AppCodePage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        maxWidth: 400,
        textAlign: "center",
      }}>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "-0.5px",
          marginBottom: 12,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}>
          Oops, wrong place!
        </h1>

        <p style={{
          fontSize: 15,
          color: "rgba(255,255,255,0.5)",
          lineHeight: 1.6,
          marginBottom: 32,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}>
          Please open the KESHAH app and scan this QR code from there.
        </p>

      </div>
    </div>
  );
}
