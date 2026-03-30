"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Building,
  CheckCircle2,
  Clock,
  ListFilter,
  Package,
  Shield,
  ShieldAlert,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import { RequestItem, ServiceItem } from "@/lib/types";
import { useEffect, useState } from "react";

type CountCard = {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: "sky" | "emerald" | "amber" | "rose" | "violet" | "cyan";
  href: string;
};

export default function AdminDashboardOverviewPage() {
  const { me, loading, logout } = useAdminSession();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [servicesCount, setServicesCount] = useState(0);
  const [companiesCount, setCompaniesCount] = useState(0);
  const [verifiersCount, setVerifiersCount] = useState(0);
  const [adminsCount, setAdminsCount] = useState(0);
  const [archiveCutoffMs, setArchiveCutoffMs] = useState(0);
  const [loadingOverview, setLoadingOverview] = useState(true);

  useEffect(() => {
    if (!me) {
      return;
    }

    const currentMe = me;

    let active = true;

    async function loadOverviewData() {
      setLoadingOverview(true);

      const requestPromise = fetch("/api/requests", { cache: "no-store" });
      const servicePromise = fetch("/api/services", { cache: "no-store" });

      const extraPromises: Promise<Response>[] = [];

      if (currentMe.role === "admin" || currentMe.role === "superadmin") {
        extraPromises.push(fetch("/api/customers", { cache: "no-store" }));
        extraPromises.push(fetch("/api/verifiers", { cache: "no-store" }));
      }

      if (currentMe.role === "superadmin") {
        extraPromises.push(fetch("/api/admins", { cache: "no-store" }));
      }

      const [requestRes, serviceRes, ...extras] = await Promise.all([
        requestPromise,
        servicePromise,
        ...extraPromises,
      ]);

      if (!active) {
        return;
      }

      if (requestRes.ok) {
        const data = (await requestRes.json()) as { items: RequestItem[] };
        setRequests(data.items ?? []);
      }

      if (serviceRes.ok) {
        const data = (await serviceRes.json()) as { items: ServiceItem[] };
        setServicesCount(data.items?.length ?? 0);
      }

      let offset = 0;
      if (currentMe.role === "admin" || currentMe.role === "superadmin") {
        const companiesRes = extras[offset++];
        const verifiersRes = extras[offset++];

        if (companiesRes?.ok) {
          const data = (await companiesRes.json()) as { items: unknown[] };
          setCompaniesCount(data.items?.length ?? 0);
        }

        if (verifiersRes?.ok) {
          const data = (await verifiersRes.json()) as { verifiers: unknown[] };
          setVerifiersCount(data.verifiers?.length ?? 0);
        }
      }

      if (currentMe.role === "superadmin") {
        const adminsRes = extras[offset];
        if (adminsRes?.ok) {
          const data = (await adminsRes.json()) as { items: unknown[] };
          setAdminsCount(data.items?.length ?? 0);
        }
      }

      setArchiveCutoffMs(Date.now() - 14 * 24 * 60 * 60 * 1000);

      setLoadingOverview(false);
    }

    loadOverviewData();

    return () => {
      active = false;
    };
  }, [me]);

  if (loading || !me || loadingOverview) {
    return <main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>;
  }

  const archivedCount = requests.filter((item) => {
    const createdAtMs = new Date(item.createdAt).getTime();
    if (Number.isNaN(createdAtMs)) {
      return false;
    }
    return createdAtMs <= archiveCutoffMs;
  }).length;

  const pendingCount = requests.filter((item) => item.status === "pending").length;
  const approvedCount = requests.filter((item) => item.status === "approved").length;
  const rejectedCount = requests.filter((item) => item.status === "rejected").length;

  const cards: CountCard[] = [
    { label: "Pending Requests", value: pendingCount, icon: Clock, tone: "amber", href: "/dashboard/requests" },
    { label: "Approved Requests", value: approvedCount, icon: CheckCircle2, tone: "emerald", href: "/dashboard/requests" },
    { label: "Rejected Requests", value: rejectedCount, icon: AlertTriangle, tone: "rose", href: "/dashboard/requests" },
    { label: "Archived Requests", value: archivedCount, icon: Archive, tone: "violet", href: "/dashboard/requests" },
    { label: "Services", value: servicesCount, icon: Package, tone: "sky", href: "/dashboard/services" },
  ];

  if (me.role === "admin" || me.role === "superadmin") {
    cards.push({ label: "Companies", value: companiesCount, icon: Building, tone: "cyan", href: "/dashboard/companies" });
    cards.push({ label: "Verifiers", value: verifiersCount, icon: Users, tone: "sky", href: "/dashboard/team" });
  }

  if (me.role === "superadmin") {
    cards.push({ label: "Admins", value: adminsCount, icon: Shield, tone: "violet", href: "/dashboard/team" });
  }

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Admin Overview"
      subtitle="Use dedicated sections to manage requests, services, teams, and companies without clutter."
    >
      {rejectedCount > 0 ? (
        <p className="inline-alert inline-alert-warning">
          {rejectedCount} rejected request{rejectedCount > 1 ? "s" : ""} need follow-up.
        </p>
      ) : null}

      <section className="portal-stats-grid" aria-label="Admin overview metrics">
        {cards.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`portal-stat portal-stat-link portal-stat-${item.tone}`}
              aria-label={`Open ${item.label.toLowerCase()}`}
            >
              <div className="portal-stat-head">
                <span className="portal-stat-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <p className="portal-stat-value">{item.value}</p>
              </div>
              <p className="portal-stat-label">{item.label}</p>
            </Link>
          );
        })}
      </section>

      <section className="quick-actions-grid" aria-label="Admin quick actions">
        <Link href="/dashboard/requests" className="quick-action-card" aria-label="Open requests workspace">
          <div className="quick-action-head">
            <ListFilter size={16} />
            <strong>Review Request Queue</strong>
          </div>
          <p className="quick-action-copy">Approve, reject, and monitor archived requests with focused controls.</p>
          <span className="quick-action-link">Open Requests <ArrowRight size={14} /></span>
        </Link>

        {(me.role === "admin" || me.role === "superadmin") && (
          <Link href="/dashboard/companies" className="quick-action-card" aria-label="Open companies workspace">
            <div className="quick-action-head">
              <Building size={16} />
              <strong>Manage Company Access</strong>
            </div>
            <p className="quick-action-copy">Issue company logins and update service pricing assignments.</p>
            <span className="quick-action-link">Open Companies <ArrowRight size={14} /></span>
          </Link>
        )}

        <Link href="/dashboard/services" className="quick-action-card" aria-label="Open services workspace">
          <div className="quick-action-head">
            <Package size={16} />
            <strong>Configure Services</strong>
          </div>
          <p className="quick-action-copy">Add service catalog entries and maintain service form structures.</p>
          <span className="quick-action-link">Open Services <ArrowRight size={14} /></span>
        </Link>

        {(me.role === "admin" || me.role === "superadmin") && (
          <Link href="/dashboard/team" className="quick-action-card" aria-label="Open team workspace">
            <div className="quick-action-head">
              {me.role === "superadmin" ? <Shield size={16} /> : <UserCheck size={16} />}
              <strong>Team Permissions</strong>
            </div>
            <p className="quick-action-copy">Manage verifier access and administrative accounts by role.</p>
            <span className="quick-action-link">Open Team <ArrowRight size={14} /></span>
          </Link>
        )}
      </section>

      <section className="glass-card" style={{ padding: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ShieldAlert size={20} color="#4A90E2" />
          Workflow Guidance
        </h2>
        <ol className="flow-list">
          <li>Process pending requests first to keep queue latency low.</li>
          <li>Update company service assignments before issuing credentials.</li>
          <li>Review verifier/admin access after any org structure changes.</li>
        </ol>
      </section>
    </AdminPortalFrame>
  );
}
