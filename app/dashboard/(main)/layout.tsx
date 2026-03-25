"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: string[];
}

interface NavSection {
  title: string;
  roles: string[];
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "App",
    roles: ["admin"],
    items: [
      { href: "/dashboard", label: "Overview", icon: "grid", roles: ["admin"] },
      { href: "/dashboard/marketing", label: "Marketing", icon: "megaphone", roles: ["admin", "marketing"] },
      { href: "/dashboard/onboarding", label: "Onboarding", icon: "funnel", roles: ["admin"] },
      { href: "/dashboard/whatsapp", label: "WhatsApp", icon: "chat", roles: ["admin"] },
      { href: "/dashboard/retention", label: "Retention", icon: "repeat", roles: ["admin"] },
    ],
  },
  {
    title: "Content",
    roles: ["admin", "manager"],
    items: [
      { href: "/dashboard/today", label: "Today", icon: "sun", roles: ["admin", "manager"] },
      { href: "/dashboard/recruit", label: "Recruit", icon: "funnel2", roles: ["manager"] },
      { href: "/dashboard/manage", label: "Manage", icon: "clipboard", roles: ["manager"] },
      { href: "/dashboard/hooks", label: "Hooks", icon: "bolt", roles: ["admin"] },
      { href: "/dashboard/managers", label: "Managers", icon: "users", roles: ["admin"] },
      { href: "/dashboard/resources", label: "Resources", icon: "book", roles: ["admin", "manager"] },
    ],
  },
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
    case "chat":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
    case "funnel2":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
      );
    case "clipboard":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        </svg>
      );
    case "bolt":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "sun":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      );
    case "book":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "users":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string>("admin");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.role) setRole(d.role);
    }).catch(() => {});
  }, []);

  // Filter sections and items by role
  const visibleSections = NAV_SECTIONS
    .filter((section) => section.roles.includes(role))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);

  // Flat list for mobile bottom tabs
  const allNavItems = visibleSections.flatMap((s) => s.items);

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
          {visibleSections.map((section) => (
            <div key={section.title}>
              {visibleSections.length > 1 && (
                <p style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.25)",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  padding: "12px 20px 4px",
                  margin: 0,
                }}>
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
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
            </div>
          ))}
        </nav>

        <div style={{ marginTop: "auto", padding: "0 8px 16px" }}>
          <button
            onClick={() => {
              fetch("/api/auth/logout", { method: "POST" }).then(() => router.push("/dashboard/login"));
            }}
            style={{
              width: "100%",
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 400,
              color: "rgba(255,255,255,0.35)",
              background: "transparent",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, paddingBottom: 80 }} className="dash-main">
        <div className="dash-content" style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>
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
        {allNavItems.map((item) => {
          const active = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: "8px 4px",
              fontSize: 10,
              fontWeight: 500,
              color: active ? "#fff" : "rgba(255,255,255,0.35)",
              textDecoration: "none",
              minWidth: 48,
              minHeight: 44,
              justifyContent: "center",
            }}>
              <NavIcon icon={item.icon} active={active} />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => {
            fetch("/api/auth/logout", { method: "POST" }).then(() => router.push("/dashboard/login"));
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            padding: "8px 4px",
            fontSize: 10,
            fontWeight: 500,
            color: "rgba(255,255,255,0.35)",
            background: "none",
            border: "none",
            cursor: "pointer",
            minWidth: 48,
            minHeight: 44,
            justifyContent: "center",
          }}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={2}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log out
        </button>
      </nav>

      <style>{`
        @media (max-width: 767px) {
          .dash-sidebar { display: none !important; }
          .dash-main { margin-left: 0 !important; }
          .dash-content { padding: 20px 14px !important; }
        }
        @media (min-width: 768px) {
          .dash-bottom-tabs { display: none !important; }
          .dash-main { margin-left: 220px !important; }
        }
      `}</style>
    </div>
  );
}
