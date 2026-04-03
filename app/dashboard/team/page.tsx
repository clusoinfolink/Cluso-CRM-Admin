"use client";

import AdminManagement from "@/components/AdminManagement";
import VerifierManagement from "@/components/VerifierManagement";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { useAdminSession } from "@/lib/hooks/useAdminSession";

export default function TeamPage() {
  const { me, loading, logout } = useAdminSession();

  if (loading || !me) {
    return <main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>;
  }

  if (me.role === "verifier") {
    return (
      <AdminPortalFrame
        me={me}
        onLogout={logout}
        title="Team Management"
        subtitle="Admin roles required for account management."
      >
        <section className="glass-card" style={{ padding: "1.2rem" }}>
          <p className="inline-alert inline-alert-warning" style={{ margin: 0 }}>
            You do not have permission to manage team account creation.
          </p>
        </section>
      </AdminPortalFrame>
    );
  }

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Team Management"
      subtitle={
        me.role === "manager"
          ? "Assign your company access to your verifiers."
          : "Create admin and manager accounts, assign verifiers to managers at creation, and review reporting roster."
      }
    >
      {me.role === "superadmin" ? <AdminManagement /> : null}
      <VerifierManagement
        viewerRole={
          me.role === "superadmin" ? "superadmin" : me.role === "manager" ? "manager" : "admin"
        }
      />
    </AdminPortalFrame>
  );
}
