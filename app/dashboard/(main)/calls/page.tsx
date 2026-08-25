// "Calls" landing page — the sidebar collapses onboarding, regrowth,
// and masterclass into a single Calls tab. This page is the shared
// landing that lets you pick which sub-view to open. Sub-pages still
// exist at their original URLs; the sidebar highlight follows all
// three via `extraActivePrefixes` in layout.tsx.

import Link from "next/link";

const TILES = [
  {
    href: "/dashboard/onboarding-call",
    title: "Onboarding call",
    body: "Post-purchase 15-min call with Aadi. Bookings, join links, no-shows.",
    accent: "#8affc1",
  },
  {
    href: "/dashboard/regrowth-consultation",
    title: "Regrowth consultation",
    body: "20-min microneedling qualification call. See who's booked.",
    accent: "#a6bfff",
  },
  {
    href: "/dashboard/masterclass",
    title: "Masterclass",
    body: "Live masterclass event config, attendee list, join button state.",
    accent: "#ffd68a",
  },
];

export default function CallsIndex() {
  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>
          Calls
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            margin: "4px 0 0",
          }}
        >
          Pick a call program. Each sub-page has bookings, join URLs, and
          any relevant admin controls.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 20,
              textDecoration: "none",
              color: "inherit",
              display: "block",
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 10,
                background: t.accent,
                marginBottom: 12,
              }}
            />
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#fff",
                marginBottom: 6,
              }}
            >
              {t.title}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.55)",
                lineHeight: 1.4,
              }}
            >
              {t.body}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
