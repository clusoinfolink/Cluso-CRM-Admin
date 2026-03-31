"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  Building2,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
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
  icon: LucideIcon;
  roles: AdminUser["role"][];
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, roles: ["admin", "superadmin", "verifier"] },
  { href: "/dashboard/requests", label: "Requests", icon: ShieldCheck, roles: ["admin", "superadmin", "verifier"] },
  { href: "/dashboard/companies", label: "Companies", icon: Building2, roles: ["admin", "superadmin"] },
  { href: "/dashboard/services", label: "Services", icon: BriefcaseBusiness, roles: ["admin", "superadmin", "verifier"] },
  { href: "/dashboard/team", label: "Team", icon: Users, roles: ["admin", "superadmin"] },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, roles: ["admin", "superadmin", "verifier"] },
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
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="Admin navigation menu">
        <div className="sidebar-brand flex items-center justify-center p-4">
          <img src="/images/cluso-infolink-logo.png" alt="Cluso Infolink" className="h-10 w-auto object-contain" />
        </div>

        <nav className="portal-nav" aria-label="Admin sections">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`portal-nav-link ${isNavActive(pathname, item.href) ? "active" : ""}`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <h1 className="admin-topbar-title">{title || "Admin Panel"}</h1>
          <div className="account-actions-wrap">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
              <User size={18} />
              {me.name}
            </div>
            <button onClick={onLogout} className="logout-btn" type="button">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </header>

        <div className="portal-shell">
          <div className="dashboard-stack">{children}</div>
        </div>
      </main>
    </div>
  );
}
