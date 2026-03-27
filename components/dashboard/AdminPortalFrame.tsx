"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, LogOut, Settings, Sparkles } from "lucide-react";
import { ReactNode } from "react";
import { AdminUser } from "@/lib/types";

type AdminPortalFrameProps = {
  me: AdminUser;
  onLogout: () => void | Promise<void>;
  title: string;
  subtitle: string;
  children: ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  roles: AdminUser["role"][];
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", roles: ["admin", "superadmin", "verifier"] },
  { href: "/dashboard/requests", label: "Requests", roles: ["admin", "superadmin", "verifier"] },
  { href: "/dashboard/companies", label: "Companies", roles: ["admin", "superadmin"] },
  { href: "/dashboard/services", label: "Services", roles: ["admin", "superadmin", "verifier"] },
  { href: "/dashboard/team", label: "Team", roles: ["admin", "superadmin"] },
  { href: "/dashboard/settings", label: "Settings", roles: ["admin", "superadmin", "verifier"] },
];

function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname.startsWith(href);
}

export function AdminPortalFrame({ me, onLogout, title, subtitle, children }: AdminPortalFrameProps) {
  const pathname = usePathname();
  const visibleNav = navItems.filter((item) => item.roles.includes(me.role));

  return (
    <main className="portal-shell">
      <div className="dashboard-stack">
        <section className="glass-card portal-banner" style={{ padding: "1rem 1.2rem" }}>
          <div className="portal-banner-content">
            <span className="portal-banner-icon" aria-hidden="true">
              <Sparkles size={16} />
            </span>
            <div>
              <strong>{title}</strong>
              <div style={{ color: "#527190", fontSize: "0.9rem" }}>{subtitle}</div>
            </div>
          </div>
          <div className="portal-banner-tag">
            <BellRing size={14} />
            Live workflow controls
          </div>
        </section>

        <section
          className="glass-card"
          style={{
            padding: "1rem 1.2rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.8rem",
            flexWrap: "wrap",
            position: "relative",
            zIndex: 30,
          }}
        >
          <div>
            <strong>{me.name}</strong>
            <div style={{ color: "#5a748f", fontSize: "0.9rem" }}>
              {me.email}{" "}
              <span
                style={{
                  textTransform: "capitalize",
                  fontWeight: 600,
                  color: me.role === "superadmin" ? "#eab308" : "#36516e",
                }}
              >
                ({me.role})
              </span>
            </div>
          </div>
          <div className="account-actions-wrap">
            <Link href="/dashboard/settings" className="btn btn-secondary title-with-icon" aria-label="Open settings">
              <Settings size={16} />
              Settings
            </Link>
            <button className="btn btn-secondary title-with-icon" onClick={onLogout} type="button">
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </section>

        <nav className="portal-nav" aria-label="Admin sections">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`portal-nav-link ${isNavActive(pathname, item.href) ? "active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </main>
  );
}
