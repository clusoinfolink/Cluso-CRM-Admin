"use client";

import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { getAlertTone } from "@/lib/alerts";
import { useAdminSession } from "@/lib/hooks/useAdminSession";

export default function SettingsPage() {
  const { me, loading, logout } = useAdminSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (newPassword !== confirmPassword) {
      setMessage("New password and confirm password must match.");
      return;
    }

    setChangingPassword(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    setChangingPassword(false);

    if (!res.ok) {
      setMessage(data.error ?? "Could not change password.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage(data.message ?? "Password changed successfully.");
  }

  if (loading || !me) {
    return <main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>;
  }

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Admin Settings"
      subtitle="Manage account security in a focused settings screen."
    >
      <section className="glass-card" style={{ padding: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <KeyRound size={20} color="#4A90E2" />
          Change Password
        </h2>
        <p style={{ color: "#5a748f", marginTop: 0 }}>
          Use a strong password and avoid reusing previous credentials.
        </p>

        <form onSubmit={changePassword} style={{ display: "grid", gap: "0.8rem" }}>
          <div>
            <label className="label" htmlFor="current-password">Current Password</label>
            <input
              id="current-password"
              className="input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="new-password">New Password</label>
            <input
              id="new-password"
              className="input"
              type="password"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="confirm-password">Confirm New Password</label>
            <input
              id="confirm-password"
              className="input"
              type="password"
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {message ? <p className={`inline-alert ${getAlertTone(message)}`}>{message}</p> : null}

          <button className="btn btn-primary" disabled={changingPassword}>
            {changingPassword ? "Updating..." : "Change Password"}
          </button>
        </form>
      </section>
    </AdminPortalFrame>
  );
}
