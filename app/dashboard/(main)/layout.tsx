"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "grid" },
  { href: "/dashboard/marketing", label: "Marketing", icon: "megaphone" },
  { href: "/dashboard/onboarding", label: "Onboarding", icon: "funnel" },
  { href: "/dashboard/retention", label: "Retention", icon: "repeat" },
];

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  const color = active ? "#fff" : "rgba(255,255,255,0.4)";
  const size = 20;

  switch (icon) {
    case "grid":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "megaphone":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case "funnel":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      );
    case "repeat":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#000" }}>
      {/* Desktop sidebar */}
      <aside style={{
        width: 220,
        borderRight: "1px solid rgba(255,255,255,0.08)",
        padding: "24px 0",
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 10,
      }} className="dash-sidebar">
        <div style={{ padding: "0 20px", marginBottom: 32 }}>
          <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px", color: "#fff" }}>
            KESHAH
          </h1>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>Dashboard</p>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: active ? "#fff" : "rgba(255,255,255,0.5)",
                background: active ? "rgba(255,255,255,0.06)" : "transparent",
                borderRadius: 8,
                margin: "0 8px",
                transition: "all 0.15s",
                textDecoration: "none",
              }}>
                <NavIcon icon={item.icon} active={active} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, paddingBottom: 80 }} className="dash-main">
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>
          {children}
        </div>
      </main>

      {/* Mobile bottom tabs */}
      <nav className="dash-bottom-tabs" style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "rgba(0,0,0,0.95)",
        backdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        justifyContent: "space-around",
        padding: "8px 0 env(safe-area-inset-bottom, 8px)",
        zIndex: 10,
      }}>
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "6px 12px",
              fontSize: 10,
              fontWeight: 500,
              color: active ? "#fff" : "rgba(255,255,255,0.35)",
              textDecoration: "none",
            }}>
              <NavIcon icon={item.icon} active={active} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <style>{`
        @media (max-width: 767px) {
          .dash-sidebar { display: none !important; }
          .dash-main { margin-left: 0 !important; }
        }
        @media (min-width: 768px) {
          .dash-bottom-tabs { display: none !important; }
          .dash-main { margin-left: 220px !important; }
        }
      `}</style>
    </div>
  );
}
