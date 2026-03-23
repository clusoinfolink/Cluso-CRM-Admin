"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckSquare, Plus, UserCheck } from "lucide-react";

type CompanyOption = {
  id: string;
  name: string;
  email: string;
};

type VerifierItem = {
  id: string;
  name: string;
  email: string;
  role: "verifier";
  assignedCompanies: CompanyOption[];
  createdAt: string;
};

type VerifierApiResponse = {
  verifiers: VerifierItem[];
  companies: CompanyOption[];
};

export default function VerifierManagement() {
  const [verifiers, setVerifiers] = useState<VerifierItem[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createCompanyIds, setCreateCompanyIds] = useState<string[]>([]);
  const [manageVerifierId, setManageVerifierId] = useState("");
  const [manageCompanyIds, setManageCompanyIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  async function loadVerifierData() {
    const res = await fetch("/api/verifiers", { cache: "no-store" });
    if (!res.ok) {
      return;
    }

    const data = (await res.json()) as VerifierApiResponse;
    setVerifiers(data.verifiers ?? []);
    setCompanies(data.companies ?? []);
  }

  useEffect(() => {
    let isMounted = true;

    async function runInitialLoad() {
      const res = await fetch("/api/verifiers", { cache: "no-store" });
      if (!res.ok || !isMounted) {
        return;
      }

      const data = (await res.json()) as VerifierApiResponse;
      if (!isMounted) {
        return;
      }

      setVerifiers(data.verifiers ?? []);
      setCompanies(data.companies ?? []);
    }

    void runInitialLoad();

    return () => {
      isMounted = false;
    };
  }, []);

  function toggleCreateCompany(companyId: string, checked: boolean) {
    setCreateCompanyIds((prev) => {
      if (checked) {
        if (prev.includes(companyId)) {
          return prev;
        }
        return [...prev, companyId];
      }

      return prev.filter((item) => item !== companyId);
    });
  }

  function toggleManageCompany(companyId: string, checked: boolean) {
    setManageCompanyIds((prev) => {
      if (checked) {
        if (prev.includes(companyId)) {
          return prev;
        }
        return [...prev, companyId];
      }

      return prev.filter((item) => item !== companyId);
    });
  }

  async function createVerifier(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    const res = await fetch("/api/verifiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        companyIds: createCompanyIds,
      }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Could not create verifier account.");
      return;
    }

    setMessage(data.message ?? "Verifier account created.");
    setName("");
    setEmail("");
    setPassword("");
    setCreateCompanyIds([]);
    await loadVerifierData();
  }

  async function updateAccess(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!manageVerifierId) {
      setMessage("Please select a verifier account first.");
      return;
    }

    const res = await fetch("/api/verifiers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verifierId: manageVerifierId,
        companyIds: manageCompanyIds,
      }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Could not update verifier company access.");
      return;
    }

    setMessage(data.message ?? "Verifier company access updated.");
    await loadVerifierData();
  }

  return (
    <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
      <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <UserCheck size={24} color="#4A90E2" />
        Verifier Management
      </h2>
      <p style={{ color: "#5a748f" }}>
        Create verifier (employee) accounts and assign only the company access they are allowed to review.
      </p>

      {message && (
        <div
          style={{
            padding: "0.8rem",
            background: "#f8fbff",
            border: "1px solid #d4e2f2",
            borderRadius: "0.4rem",
            marginBottom: "1rem",
          }}
        >
          {message}
        </div>
      )}

      <form
        onSubmit={createVerifier}
        style={{
          display: "grid",
          gap: "0.8rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          marginBottom: "1rem",
        }}
      >
        <div>
          <label className="label">Verifier Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Verifier Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        <div style={{ gridColumn: "1 / -1", display: "grid", gap: "0.5rem" }}>
          <label className="label">Grant Company Access At Creation</label>
          {companies.length === 0 && (
            <div style={{ color: "#5a748f" }}>No companies found. Create company accounts first.</div>
          )}
          {companies.map((company) => (
            <label key={`create-${company.id}`} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={createCompanyIds.includes(company.id)}
                onChange={(e) => toggleCreateCompany(company.id, e.target.checked)}
              />
              {company.name} ({company.email})
            </label>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "end" }}>
          <button className="btn btn-primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
            <Plus size={18} />
            Create Verifier Account
          </button>
        </div>
      </form>

      <form onSubmit={updateAccess} style={{ display: "grid", gap: "0.8rem" }}>
        <div>
          <label className="label">Manage Existing Verifier Access</label>
          <select
            className="input"
            value={manageVerifierId}
            onChange={(e) => {
              const nextVerifierId = e.target.value;
              setManageVerifierId(nextVerifierId);

              const verifier = verifiers.find((item) => item.id === nextVerifierId);
              setManageCompanyIds(
                verifier ? verifier.assignedCompanies.map((company) => company.id) : [],
              );
            }}
            required
          >
            <option value="">Choose verifier</option>
            {verifiers.map((verifier) => (
              <option key={verifier.id} value={verifier.id}>
                {verifier.name} ({verifier.email})
              </option>
            ))}
          </select>
        </div>

        {manageVerifierId && (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <label className="label">Add / Remove Company Access</label>
            {companies.map((company) => (
              <label key={`manage-${company.id}`} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={manageCompanyIds.includes(company.id)}
                  onChange={(e) => toggleManageCompany(company.id, e.target.checked)}
                />
                {company.name} ({company.email})
              </label>
            ))}
          </div>
        )}

        <div>
          <button className="btn btn-primary" type="submit" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            <CheckSquare size={18} />
            Save Verifier Access
          </button>
        </div>
      </form>
    </section>
  );
}
