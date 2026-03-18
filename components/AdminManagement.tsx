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
  const [role, setRole] = useState<"admin" | "superadmin">("admin");
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

    setMessage("Admin created successfully");
    setName("");
    setEmail("");
    setPassword("");
    setRole("admin");
    loadAdmins();
  }

  return (
    <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
      <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Shield size={24} color="#4A90E2" />
        Admin Management
      </h2>
      <p style={{ color: "#5a748f" }}>
        Create new administrative accounts. Superadmins can manage the whole system and create new admins.
      </p>
      
      {message && (
        <div style={{ padding: "0.8rem", background: "#f8fbff", border: "1px solid #d4e2f2", borderRadius: "0.4rem", marginBottom: "1rem" }}>
          {message}
        </div>
      )}

      <form
        onSubmit={createAdmin}
        style={{
          display: "grid",
          gap: "0.8rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          marginBottom: "1.5rem"
        }}
      >
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as "admin" | "superadmin")} required>
            <option value="admin">Admin</option>
            <option value="superadmin">Super Admin</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "end" }}>
          <button className="btn btn-primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
            <Plus size={18} />
            Create Admin
          </button>
        </div>
      </form>

      {admins.length > 0 && (
        <div>
          <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>Existing Admins</h3>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {admins.map(a => (
              <div key={a.id} style={{ border: "1px solid #d4e2f2", borderRadius: "0.65rem", padding: "0.65rem 0.8rem", background: "#f8fbff", display: "flex", gap: "0.8rem", alignItems: "center" }}>
                <Shield size={18} color={a.role === "superadmin" ? "#eab308" : "#4A90E2"} />
                <div>
                  <strong>{a.name}</strong> <span style={{ color: "#5a748f", fontSize: "0.9rem" }}>({a.email})</span>
                  <div style={{ color: "#36516e", fontSize: "0.85rem", marginTop: "0.2rem", textTransform: "capitalize" }}>
                    Role: {a.role}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
