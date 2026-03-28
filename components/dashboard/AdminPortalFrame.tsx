"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  BriefcaseBusiness,
  Building2,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const PREFETCH_ROUTES = new Set(["/dashboard/services"]);

function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname.startsWith(href);
}

export function AdminPortalFrame({ me, onLogout, title, subtitle, children }: AdminPortalFrameProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationsSeen, setNotificationsSeen] = useState(false);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const visibleNav = navItems.filter((item) => item.roles.includes(me.role));
  const notificationItems = useMemo(() => {
    const items = [
      {
        id: "queue",
        title: "Requests Queue",
        detail: "Pending submissions are waiting for review in the requests section.",
      },
      {
        id: "services",
        title: "Service Updates",
        detail: "Keep service forms and pricing aligned before inviting companies.",
      },
      {
        id: "security",
        title: "Access Check",
        detail:
          me.role === "superadmin"
            ? "Review admin and verifier permissions after role changes."
            : "Verify team roles are up to date for safe approvals.",
      },
    ];

    return items;
  }, [me.role]);

  const unreadCount = notificationsSeen ? 0 : notificationItems.length;

  const prefetchNavRoute = useCallback((href: string) => {
    if (!PREFETCH_ROUTES.has(href)) {
      return;
    }

    router.prefetch(href);
  }, [router]);

  useEffect(() => {
    if (!notificationOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!notificationPanelRef.current) {
        return;
      }

      if (!notificationPanelRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotificationOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [notificationOpen]);

  return (
    <main className="portal-shell">
      <div className="admin-layout">
        <aside className="glass-card admin-sidebar" aria-label="Admin navigation menu">
          <div className="sidebar-brand">
            <span className="portal-banner-icon" aria-hidden="true">
              <Sparkles size={16} />
            </span>
            <div>
              <strong>Cluso Admin</strong>
              <p>Operations center</p>
            </div>
          </div>

          <nav className="portal-nav" aria-label="Admin sections">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`portal-nav-link ${isNavActive(pathname, item.href) ? "active" : ""}`}
                  onMouseEnter={() => prefetchNavRoute(item.href)}
                  onFocus={() => prefetchNavRoute(item.href)}
                  onClick={() => prefetchNavRoute(item.href)}
                >
                  <span className="portal-nav-icon" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-footer-chip">
            <BellRing size={14} />
            Live workflow controls
          </div>
        </aside>

        <section className="admin-main">
          <header className="glass-card admin-topbar">
            <div className="admin-topbar-copy">
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>

            <div className="account-actions-wrap">
              <div className="notification-wrap" ref={notificationPanelRef}>
                <button
                  type="button"
                  className={`notification-bell ${notificationOpen ? "active" : ""}`}
                  aria-label="Open notifications"
                  aria-haspopup="dialog"
                  aria-expanded={notificationOpen}
                  aria-controls="admin-notifications-panel"
                  onClick={() => {
                    setNotificationOpen((prev) => {
                      const nextOpen = !prev;
                      if (nextOpen) {
                        setNotificationsSeen(true);
                      }
                      return nextOpen;
                    });
                  }}
                >
                  <Bell size={18} />
                  {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
                </button>

                {notificationOpen ? (
                  <section
                    id="admin-notifications-panel"
                    className="glass-card notification-panel"
                    role="dialog"
                    aria-label="Recent notifications"
                  >
                    <div className="notification-panel-head">
                      <strong>Notifications</strong>
                      <span>{notificationItems.length} updates</span>
                    </div>
                    <ul className="notification-list">
                      {notificationItems.map((item) => (
                        <li key={item.id} className="notification-item">
                          <span className="notification-item-dot" aria-hidden="true" />
                          <div>
                            <strong>{item.title}</strong>
                            <p>{item.detail}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>

              <Link href="/dashboard/settings" className="btn btn-secondary title-with-icon" aria-label="Open settings">
                <Settings size={16} />
                Settings
              </Link>
              <button className="btn btn-secondary title-with-icon" onClick={onLogout} type="button">
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </header>

          <section className="glass-card portal-banner">
            <div className="portal-banner-content">
              <span className="portal-banner-icon" aria-hidden="true">
                <Sparkles size={16} />
              </span>
              <div>
                <strong>{me.name}</strong>
                <p>{me.email}</p>
              </div>
            </div>
            <span className="portal-banner-tag" style={{ textTransform: "capitalize" }}>
              {me.role} mode
            </span>
          </section>

          <div className="dashboard-stack">{children}</div>
        </section>
      </div>
    </main>
  );
}
