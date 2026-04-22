"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CheckCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  User,
  Users,
  PieChart,
  Activity,
  Briefcase,
  Search,
  ScanEye,
  Wallet,
  CreditCard,
  Shield,
  Sliders,
  BellRing,
  type LucideIcon,
} from "lucide-react";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminUser, RequestItem } from "@/lib/types";

type AdminPortalFrameProps = {
  me: AdminUser;
  onLogout: () => void | Promise<void>;
  title: string;
  subtitle: string;
  children: ReactNode;
};

type NavItemTheme = {
  bg: string;
  border: string;
  text: string;
  iconColor: string;
  gradient: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: AdminUser["role"][];
  description: string;
  subIcons: LucideIcon[];
  theme: NavItemTheme;
};

const navItems: NavItem[] = [
  { 
    href: "/dashboard", 
    label: "Overview", 
    icon: LayoutDashboard, 
    roles: ["admin", "superadmin", "manager", "verifier"],
    description: "Get a bird's-eye view of your enterprise metrics, recent activity, and platform health.",
    subIcons: [PieChart, Activity],
    theme: {
      bg: "bg-blue-50 dark:bg-blue-900/40",
      border: "border-blue-200 dark:border-blue-800",
      text: "text-blue-800 dark:text-blue-300",
      iconColor: "text-blue-600 dark:text-blue-400",
      gradient: "from-blue-500 to-cyan-400",
    }
  },
  { 
    href: "/dashboard/completed", 
    label: "Completed Requests", 
    icon: CheckCheck, 
    roles: ["admin", "superadmin", "manager", "verifier"],
    description: "View finished verifications and track historically completed requests.",
    subIcons: [ShieldCheck, FileText],
    theme: {
      bg: "bg-emerald-50 dark:bg-emerald-900/40",
      border: "border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-800 dark:text-emerald-300",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      gradient: "from-emerald-500 to-teal-400",
    }
  },
  { 
    href: "/dashboard/requests", 
    label: "Requests", 
    icon: ShieldCheck, 
    roles: ["admin", "superadmin", "manager", "verifier"],
    description: "Review detailed candidate form submissions, evaluate enterprise decisions, and track verifications.",
    subIcons: [Search, ScanEye],
    theme: {
      bg: "bg-violet-50 dark:bg-violet-900/40",
      border: "border-violet-200 dark:border-violet-800",
      text: "text-violet-800 dark:text-violet-300",
      iconColor: "text-violet-600 dark:text-violet-400",
      gradient: "from-violet-500 to-fuchsia-400",
    }
  },
  { 
    href: "/dashboard/companies", 
    label: "Companies", 
    icon: Building2, 
    roles: ["admin", "superadmin"],
    description: "Manage client organizations, their sub-accounts, and view active enterprise relationships.",
    subIcons: [BriefcaseBusiness, Users],
    theme: {
      bg: "bg-indigo-50 dark:bg-indigo-900/40",
      border: "border-indigo-200 dark:border-indigo-800",
      text: "text-indigo-800 dark:text-indigo-300",
      iconColor: "text-indigo-600 dark:text-indigo-400",
      gradient: "from-indigo-500 to-purple-400",
    }
  },
  { 
    href: "/dashboard/services", 
    label: "Services", 
    icon: BriefcaseBusiness, 
    roles: ["admin", "superadmin", "verifier"],
    description: "Configure verification service offerings, custom checks, and specific client integrations.",
    subIcons: [Settings, Shield],
    theme: {
      bg: "bg-orange-50 dark:bg-orange-900/40",
      border: "border-orange-200 dark:border-orange-800",
      text: "text-orange-800 dark:text-orange-300",
      iconColor: "text-orange-600 dark:text-orange-400",
      gradient: "from-orange-500 to-amber-400",
    }
  },
  { 
    href: "/dashboard/invoices", 
    label: "Invoices", 
    icon: FileText, 
    roles: ["admin", "superadmin"],
    description: "Access billing history, download comprehensive invoices, and manage receipts safely.",
    subIcons: [Wallet, CreditCard],
    theme: {
      bg: "bg-rose-50 dark:bg-rose-900/40",
      border: "border-rose-200 dark:border-rose-800",
      text: "text-rose-800 dark:text-rose-300",
      iconColor: "text-rose-600 dark:text-rose-400",
      gradient: "from-rose-500 to-pink-400",
    }
  },
  { 
    href: "/dashboard/team", 
    label: "Team", 
    icon: Users, 
    roles: ["admin", "superadmin", "manager"],
    description: "Manage admin users, configure member permission levels, and secure platform access.",
    subIcons: [User, ShieldCheck],
    theme: {
      bg: "bg-cyan-50 dark:bg-cyan-900/40",
      border: "border-cyan-200 dark:border-cyan-800",
      text: "text-cyan-800 dark:text-cyan-300",
      iconColor: "text-cyan-600 dark:text-cyan-400",
      gradient: "from-cyan-500 to-sky-400",
    }
  },
  { 
    href: "/dashboard/settings", 
    label: "Settings", 
    icon: Settings, 
    roles: ["admin", "superadmin", "manager", "verifier"],
    description: "Adjust system preferences, authentication parameters, and core profile details.",
    subIcons: [Sliders, BellRing],
    theme: {
      bg: "bg-slate-100 dark:bg-slate-800",
      border: "border-slate-200 dark:border-slate-700",
      text: "text-slate-800 dark:text-slate-300",
      iconColor: "text-slate-600 dark:text-slate-400",
      gradient: "from-slate-400 to-slate-300",
    }
  },
];

const REQUESTS_QUERY_KEY = ["admin-requests"];
const REQUESTS_STALE_TIME_MS = 5 * 60 * 1000;

type NotificationItem = {
  id: string;
  requestId: string;
  title: string;
  detail: string;
  status: RequestItem["status"];
  createdAtMs: number;
};

async function fetchRequestsForNotifications() {
  const response = await fetch("/api/requests", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load requests.");
  }

  const data = (await response.json()) as { items?: RequestItem[] };
  return data.items ?? [];
}

function getAdminNotificationContent(item: RequestItem) {
  if (item.reverificationAppeal?.status === "open") {
    const appealedServiceNames = (item.reverificationAppeal.services ?? [])
      .map((service) => service.serviceName)
      .filter((name) => typeof name === "string" && name.trim().length > 0);
    const appealedServicesLabel = appealedServiceNames.length > 0 ? appealedServiceNames.join(", ") : "requested services";

    return {
      title: "Reverification appeal submitted",
      detail: `${item.candidateName} requested recheck for ${appealedServicesLabel}`,
    };
  }

  if (item.status === "verified") {
    return {
      title: "Request verified",
      detail: `${item.candidateName} - ${item.customerName}`,
    };
  }

  if (item.status === "approved") {
    return {
      title: "Request approved",
      detail: `${item.candidateName} - ${item.customerName}`,
    };
  }

  if (item.status === "rejected") {
    return {
      title: "Request rejected",
      detail: `${item.candidateName} - ${item.customerName}`,
    };
  }

  if (item.candidateFormStatus === "submitted") {
    return {
      title: "New request submitted",
      detail: `${item.candidateName} is ready for review`,
    };
  }

  return {
    title: "New request created",
    detail: `${item.candidateName} - ${item.customerName}`,
  };
}

function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname.startsWith(href);
}

export function AdminPortalFrame({ me, onLogout, title, subtitle, children }: AdminPortalFrameProps) {
  const pathname = usePathname();
  const router = useRouter();
  const visibleNav = navItems.filter((item) => item.roles.includes(me.role));
  const notificationWrapRef = useRef<HTMLDivElement | null>(null);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [clearedNotificationIds, setClearedNotificationIds] = useState<string[]>([]);

  const requestsQuery = useQuery<RequestItem[]>({
    queryKey: REQUESTS_QUERY_KEY,
    queryFn: fetchRequestsForNotifications,
    staleTime: REQUESTS_STALE_TIME_MS,
    enabled: Boolean(me.id),
    refetchInterval: 60 * 1000,
  });

  const notificationStorageKey = useMemo(
    () => `cluso-admin-cleared-notifications:${me.id}`,
    [me.id],
  );

  const notifications = useMemo<NotificationItem[]>(() => {
    return (requestsQuery.data ?? [])
      .map((item) => {
        const parsedCreatedAt = Date.parse(item.createdAt);
        const requestCreatedAtMs = Number.isNaN(parsedCreatedAt) ? 0 : parsedCreatedAt;
        const parsedAppealSubmittedAt =
          item.reverificationAppeal?.status === "open" ? Date.parse(item.reverificationAppeal.submittedAt) : Number.NaN;
        const createdAtMs = Number.isNaN(parsedAppealSubmittedAt) ? requestCreatedAtMs : parsedAppealSubmittedAt;
        const content = getAdminNotificationContent(item);
        const appealKey = item.reverificationAppeal
          ? `${item.reverificationAppeal.status}:${item.reverificationAppeal.submittedAt}:${item.reverificationAppeal.resolvedAt ?? ""}`
          : "none";

        return {
          id: `${item._id}:${item.status}:${item.candidateFormStatus ?? "pending"}:${appealKey}`,
          requestId: item._id,
          title: content.title,
          detail: content.detail,
          status: item.status,
          createdAtMs,
        };
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [requestsQuery.data]);

  const persistClearedNotifications = useCallback(
    (ids: string[]) => {
      try {
        localStorage.setItem(notificationStorageKey, JSON.stringify(ids));
      } catch {
        // Ignore storage write errors and keep in-memory state.
      }
    },
    [notificationStorageKey],
  );

  useEffect(() => {
    let nextClearedIds: string[] = [];

    try {
      const storedValue = localStorage.getItem(notificationStorageKey);
      if (!storedValue) {
        nextClearedIds = [];
      } else {
        const parsed = JSON.parse(storedValue);
        if (!Array.isArray(parsed)) {
          nextClearedIds = [];
        } else {
          nextClearedIds = parsed.filter((item): item is string => typeof item === "string");
        }
      }
    } catch {
      nextClearedIds = [];
    }

    const timer = window.setTimeout(() => {
      setClearedNotificationIds(nextClearedIds);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [notificationStorageKey]);

  useEffect(() => {
    if (!isNotificationOpen) {
      return;
    }

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!notificationWrapRef.current?.contains(target)) {
        setIsNotificationOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsNotificationOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isNotificationOpen]);

  const clearedSet = useMemo(() => new Set(clearedNotificationIds), [clearedNotificationIds]);

  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !clearedSet.has(item.id)),
    [clearedSet, notifications],
  );

  const clearNotification = useCallback(
    (id: string) => {
      setClearedNotificationIds((prev) => {
        if (prev.includes(id)) {
          return prev;
        }

        const next = [...prev, id];
        persistClearedNotifications(next);
        return next;
      });
    },
    [persistClearedNotifications],
  );

  const clearAllNotifications = useCallback(() => {
    const next = notifications.map((item) => item.id);
    setClearedNotificationIds(next);
    persistClearedNotifications(next);
  }, [notifications, persistClearedNotifications]);

  const openRequestFromNotification = useCallback(
    (requestId: string) => {
      setIsNotificationOpen(false);
      router.push(`/dashboard/requests?requestId=${encodeURIComponent(requestId)}`);
    },
    [router, setIsNotificationOpen],
  );

  return (
    <div className="admin-layout">
      <aside
        id="admin-mobile-nav"
        className={`admin-sidebar ${isMobileNavOpen ? "mobile-open" : ""}`}
        aria-label="Admin navigation menu"
      >
        <div className="sidebar-brand flex items-center justify-center p-4">
          <Image
            src="/images/cluso-infolink-logo.png"
            alt="Cluso Infolink"
            width={220}
            height={40}
            className="h-10 w-auto object-contain"
            priority
          />
        </div>

        <nav className="portal-nav" aria-label="Admin sections">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.href} className="relative group z-0 flex items-stretch lg:group-hover:z-[1600]">
                <Link
                  href={item.href}
                  onClick={() => setIsMobileNavOpen(false)}
                  className={`portal-nav-link w-full ${isNavActive(pathname, item.href) ? "active" : ""}`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>

                <div 
                  className="absolute left-full ml-[0.35rem] top-1/2 w-[270px] -translate-y-1/2 hidden lg:group-hover:flex flex-col z-[1700] pointer-events-none scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-200 origin-left"
                >
                  <div className={`absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 rotate-45 border-l border-b bg-white dark:bg-slate-900 ${item.theme.border} z-[1] drop-shadow-sm`}></div>
                  
                  <div className={`relative px-4 py-4 pb-5 rounded-2xl shadow-xl bg-white dark:bg-slate-900 border ${item.theme.border} z-[2] overflow-hidden`}>
                    <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${item.theme.gradient}`} />

                    <div className="flex items-center gap-3 mb-2 pt-1">
                      <div className={`p-1.5 rounded-lg flex items-center justify-center ${item.theme.bg} ${item.theme.text}`}>
                        <Icon size={16} strokeWidth={2.5} className="drop-shadow-sm" />
                      </div>
                      <strong className="text-[14.5px] font-bold tracking-tight text-slate-800 dark:text-slate-100">{item.label}</strong>
                    </div>
                    
                    <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 mt-2 mb-4 font-medium px-0.5">
                      {item.description}
                    </p>
                    
                    <div className="flex items-center gap-2 mt-auto px-0.5">
                      {item.subIcons?.map((SubIcon, idx) => (
                         <div key={idx} className={`p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/80 ${item.theme.iconColor}`}>
                           <SubIcon size={16} strokeWidth={2} />
                         </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      {isMobileNavOpen ? (
        <button
          type="button"
          className="portal-mobile-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setIsMobileNavOpen(false)}
        />
      ) : null}

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="portal-topbar-leading" style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <button
              type="button"
              className="portal-nav-overflow-trigger"
              onClick={() => setIsMobileNavOpen((prev) => !prev)}
              aria-label="Open menu"
              aria-expanded={isMobileNavOpen}
              aria-controls="admin-mobile-nav"
            >
              <Menu size={18} />
            </button>
            <div style={{ display: "grid", gap: "0.15rem" }}>
              <h1 className="admin-topbar-title">{title || "Admin Panel"}</h1>
              {subtitle ? (
                <p style={{ margin: 0, color: "#6B7A90", fontSize: "0.85rem" }}>{subtitle}</p>
              ) : null}
            </div>
          </div>
          <div className="account-actions-wrap">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
              <User size={18} />
              {me.name}
            </div>
            <div ref={notificationWrapRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setIsNotificationOpen((prev) => !prev)}
                aria-expanded={isNotificationOpen}
                aria-haspopup="dialog"
                aria-label={`Notifications (${unreadNotifications.length} unread)`}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "2.2rem",
                  height: "2.2rem",
                  borderRadius: "999px",
                  border: "1px solid #D7DDE5",
                  background: "#FFFFFF",
                  color: "#2D405E",
                  cursor: "pointer",
                }}
              >
                <Bell size={16} />
                {unreadNotifications.length > 0 ? (
                  <span
                    style={{
                      position: "absolute",
                      top: "-0.3rem",
                      right: "-0.3rem",
                      minWidth: "1.1rem",
                      height: "1.1rem",
                      borderRadius: "999px",
                      background: "#DC3545",
                      color: "#FFFFFF",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      padding: "0 0.2rem",
                    }}
                  >
                    {unreadNotifications.length > 99 ? "99+" : unreadNotifications.length}
                  </span>
                ) : null}
              </button>

              {isNotificationOpen ? (
                <div
                  role="dialog"
                  aria-label="Notifications"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 0.5rem)",
                    right: 0,
                    width: "min(24rem, calc(100vw - 2rem))",
                    maxHeight: "22rem",
                    overflow: "hidden",
                    border: "1px solid #D7DDE5",
                    borderRadius: "12px",
                    background: "#FFFFFF",
                    boxShadow: "0 14px 30px rgba(45, 64, 94, 0.18)",
                    zIndex: 30,
                    display: "grid",
                    gridTemplateRows: "auto 1fr",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.7rem 0.85rem",
                      borderBottom: "1px solid #E6ECF3",
                    }}
                  >
                    <strong style={{ color: "#2D405E" }}>Notifications</strong>
                    {unreadNotifications.length > 0 ? (
                      <button
                        type="button"
                        onClick={clearAllNotifications}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#2D405E",
                          cursor: "pointer",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <CheckCheck size={14} />
                        Clear all
                      </button>
                    ) : null}
                  </div>

                  <div style={{ overflowY: "auto", padding: "0.75rem", display: "grid", gap: "0.6rem" }}>
                    {requestsQuery.isLoading ? (
                      <p style={{ margin: 0, color: "#6B7A90" }}>Loading activity...</p>
                    ) : unreadNotifications.length === 0 ? (
                      <p style={{ margin: 0, color: "#6B7A90" }}>No new activity.</p>
                    ) : (
                      unreadNotifications.map((notification) => {
                        const tone =
                          notification.status === "verified"
                            ? { border: "#9DDCCB", background: "#E8F8F3" }
                            : notification.status === "approved"
                            ? { border: "#BFE8C9", background: "#ECF8EF" }
                            : notification.status === "rejected"
                              ? { border: "#F5C2C7", background: "#FDF2F3" }
                              : { border: "#C4D9F8", background: "#EEF4FF" };

                        return (
                          <article
                            key={notification.id}
                            style={{
                              border: `1px solid ${tone.border}`,
                              background: tone.background,
                              borderRadius: "10px",
                              padding: "0.6rem 0.65rem",
                              display: "grid",
                              gap: "0.3rem",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "0.5rem",
                              }}
                            >
                              <strong style={{ color: "#2D405E", fontSize: "0.9rem" }}>
                                {notification.title}
                              </strong>
                              <button
                                type="button"
                                onClick={() => clearNotification(notification.id)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "#2D405E",
                                  cursor: "pointer",
                                  fontSize: "0.8rem",
                                  fontWeight: 600,
                                  padding: 0,
                                }}
                              >
                                Clear
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => openRequestFromNotification(notification.requestId)}
                              style={{
                                border: "none",
                                background: "transparent",
                                padding: 0,
                                textAlign: "left",
                                display: "grid",
                                gap: "0.25rem",
                                cursor: "pointer",
                                color: "inherit",
                              }}
                            >
                              <span style={{ color: "#44536A", fontSize: "0.84rem" }}>{notification.detail}</span>
                              <span style={{ color: "#667892", fontSize: "0.77rem" }}>
                                {notification.createdAtMs > 0
                                  ? new Date(notification.createdAtMs).toLocaleString()
                                  : "Unknown time"}
                              </span>
                            </button>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
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
