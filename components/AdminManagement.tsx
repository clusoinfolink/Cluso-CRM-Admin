"use client";

import { FormEvent, useEffect, useState } from "react";
import { Shield, Plus } from "lucide-react";

type AdminUserList = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

export default function AdminManagement() {
  const [admins, setAdmins] = useState<AdminUserList[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "manager" | "superadmin">("admin");
  const [message, setMessage] = useState("");

  async function loadAdmins() {
    const res = await fetch("/api/admins");
    if (res.ok) {
      const data = await res.json();
      setAdmins(data.items || []);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line
    loadAdmins();
  }, []);

  async function createAdmin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    const res = await fetch("/api/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Failed to create admin");
      return;
    }

    setMessage("Team account created successfully");
    setName("");
    setEmail("");
    setPassword("");
    setRole("admin");
    loadAdmins();
  }

  return (
    <section style={{ marginBottom: "2rem" }}>
      <div 
        className="glass-card" 
        style={{ 
          padding: "1.5rem", 
          background: "rgba(255, 255, 255, 0.75)", 
          backdropFilter: "blur(12px)", 
          WebkitBackdropFilter: "blur(12px)", 
          border: "1px solid rgba(255, 255, 255, 0.4)", 
          borderRadius: "16px",
          boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.07)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem", color: "#1E293B", fontSize: "1.25rem" }}>
              <Shield size={24} color="#4A90E2" />
              Admin & Manager Management
            </h2>
            <p style={{ color: "#64748B", margin: 0, fontSize: "0.95rem" }}>
              Create admin and manager accounts to supervise verifier activity.
            </p>
          </div>
        </div>
        
        {message && (
          <div style={{ padding: "0.8rem", background: "#F1F5F9", borderLeft: "4px solid #4A90E2", borderRadius: "0 0.4rem 0.4rem 0", marginBottom: "1.5rem", color: "#334155", fontWeight: 500 }}>
            {message}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "2rem", alignItems: "start" }}>
          {/* Creation Form */}
          <div style={{ background: "#FFFFFF", padding: "1.25rem", borderRadius: "12px", border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "1.05rem", color: "#334155", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Plus size={18} color="#4A90E2" /> Create New Account
            </h3>
            <form onSubmit={createAdmin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "0.3rem" }}>Full Name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%", background: "#F8FAFC" }} />
              </div>
              <div>
                <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "0.3rem" }}>Email Address</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%", background: "#F8FAFC" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                <div>
                  <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "0.3rem" }}>Password</label>
                  <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={{ width: "100%", background: "#F8FAFC" }} />
                </div>
                <div>
                  <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "0.3rem" }}>Role</label>
                  <select className="input" value={role} onChange={(e) => setRole(e.target.value as "admin" | "manager" | "superadmin")} required style={{ width: "100%", background: "#F8FAFC" }}>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </div>
              </div>
              <button className="btn btn-primary" style={{ width: "100%", marginTop: "0.5rem", padding: "0.6rem", fontWeight: 600, transition: "all 0.2s" }}>
                Create Account
              </button>
            </form>
          </div>

          {/* Account List */}
          <div style={{ background: "#FFFFFF", padding: "1.25rem", borderRadius: "12px", border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", minHeight: "330px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "1.05rem", color: "#334155", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Existing Accounts</span>
              <span style={{ fontSize: "0.8rem", background: "#E0E7FF", color: "#4338CA", padding: "0.2rem 0.6rem", borderRadius: "999px" }}>{admins.length} Total</span>
            </h3>
            
            {admins.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#94A3B8" }}>
                No accounts found.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.6rem", maxHeight: "250px", overflowY: "auto", paddingRight: "0.5rem" }}>
                {admins.map(a => (
                  <div key={a.id} style={{ border: "1px solid #F1F5F9", borderRadius: "8px", padding: "0.75rem 1rem", background: "#F8FAFC", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.2s", cursor: "default" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "#CBD5E1"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "#F1F5F9"}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                      <div style={{ background: a.role === "superadmin" ? "#E0E7FF" : a.role === "admin" ? "#DCFCE7" : "#F3E8FF", padding: "0.5rem", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Shield size={16} color={a.role === "superadmin" ? "#4F46E5" : a.role === "admin" ? "#16A34A" : "#9333EA"} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: "#1E293B", fontSize: "0.95rem" }}>{a.name}</div>
                        <div style={{ color: "#64748B", fontSize: "0.85rem" }}>{a.email}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", background: "#FFFFFF", border: "1px solid #E2E8F0", padding: "0.2rem 0.6rem", borderRadius: "4px", color: "#475569" }}>
                      {a.role}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
