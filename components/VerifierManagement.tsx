"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, UserCheck, Users, Briefcase, Settings2, AlertCircle } from "lucide-react";
import { SearchableSelect } from "@/components/SearchableSelect";

type CompanyOption = {
  id: string;
  name: string;
  email: string;
};

type ManagerSummary = {
  id: string;
  name: string;
  email: string;
};

type ManagerOption = ManagerSummary & {
  assignedCompanies: CompanyOption[];
};

type VerifierItem = {
  id: string;
  name: string;
  email: string;
  role: "verifier";
  manager: ManagerSummary | null;
  assignedCompanies: CompanyOption[];
  createdAt: string;
};

type VerifierApiResponse = {
  verifiers: VerifierItem[];
  companies: CompanyOption[];
  managers: ManagerOption[];
};

type VerifierManagementProps = {
  viewerRole?: "admin" | "superadmin" | "manager";
};

export default function VerifierManagement({ viewerRole = "admin" }: VerifierManagementProps) {
  const isManagerView = viewerRole === "manager";
  const [activeTab, setActiveTab] = useState<"roster" | "creation" | "access">("roster");

  const [verifiers, setVerifiers] = useState<VerifierItem[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createManagerId, setCreateManagerId] = useState("");
  const [createCompanyIds, setCreateCompanyIds] = useState<string[]>([]);
  
  const [manageVerifierId, setManageVerifierId] = useState("");
  const [manageCompanyIds, setManageCompanyIds] = useState<string[]>([]);
  const [promoteVerifierToManager, setPromoteVerifierToManager] = useState(false);
  const [manageManagerId, setManageManagerId] = useState("");
  const [manageManagerCompanyIds, setManageManagerCompanyIds] = useState<string[]>([]);
  
  const [bulkManagerId, setBulkManagerId] = useState("");
  const [bulkVerifierIds, setBulkVerifierIds] = useState<string[]>([]);
  
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadVerifierData() {
    setLoading(true);
    try {
      const res = await fetch("/api/verifiers", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as VerifierApiResponse;
      setVerifiers(data.verifiers ?? []);
      setCompanies(data.companies ?? []);
      setManagers(data.managers ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;
    async function runInitialLoad() {
      if (!isMounted) return;
      await loadVerifierData();
    }
    void runInitialLoad();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!bulkManagerId) {
      setBulkVerifierIds([]);
      return;
    }

    const assignedVerifierIds = verifiers
      .filter((verifier) => verifier.manager?.id === bulkManagerId)
      .map((verifier) => verifier.id);

    setBulkVerifierIds(assignedVerifierIds);
  }, [bulkManagerId, verifiers]);

  const rosterRows = useMemo(
    () =>
      managers.map((manager) => ({
        manager,
        verifiers: verifiers.filter((verifier) => verifier.manager?.id === manager.id),
      })),
    [managers, verifiers],
  );

  const unassignedVerifiers = useMemo(
    () => verifiers.filter((verifier) => !verifier.manager),
    [verifiers],
  );

  const verifierAccessOptions = useMemo(
    () =>
      verifiers.map((verifier) => ({
        value: verifier.id,
        label: `${verifier.name} (${verifier.email})${verifier.manager ? ` - Manager: ${verifier.manager.name}` : " - Unassigned"}`,
      })),
    [verifiers],
  );

  // Toggles
  function toggleCreateCompany(companyId: string, checked: boolean) {
    setCreateCompanyIds((prev) => checked ? (prev.includes(companyId) ? prev : [...prev, companyId]) : prev.filter((item) => item !== companyId));
  }
  function toggleManageCompany(companyId: string, checked: boolean) {
    setManageCompanyIds((prev) => checked ? (prev.includes(companyId) ? prev : [...prev, companyId]) : prev.filter((item) => item !== companyId));
  }
  function toggleManageManagerCompany(companyId: string, checked: boolean) {
    setManageManagerCompanyIds((prev) => checked ? (prev.includes(companyId) ? prev : [...prev, companyId]) : prev.filter((item) => item !== companyId));
  }
  function toggleBulkVerifier(verifierId: string, checked: boolean) {
    setBulkVerifierIds((prev) => checked ? (prev.includes(verifierId) ? prev : [...prev, verifierId]) : prev.filter((item) => item !== verifierId));
  }

  // Handlers
  async function createVerifier(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    const res = await fetch("/api/verifiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, managerId: createManagerId, companyIds: createCompanyIds }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Could not create verifier account.");
      return;
    }
    setMessage(data.message ?? "Verifier account created.");
    setName(""); setEmail(""); setPassword(""); setCreateManagerId(""); setCreateCompanyIds([]);
    await loadVerifierData();
  }

  async function updateAccess(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    if (!manageVerifierId) { setMessage("Please select a verifier first."); return; }
    const res = await fetch("/api/verifiers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verifierId: manageVerifierId, companyIds: manageCompanyIds, promoteToManager: promoteVerifierToManager }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) { setMessage(data.error ?? "Could not update verifier company access."); return; }
    setMessage(data.message ?? "Verifier company access updated.");
    if (promoteVerifierToManager) {
      setManageVerifierId("");
      setManageCompanyIds([]);
      setPromoteVerifierToManager(false);
    }
    await loadVerifierData();
  }

  async function updateManagerAccess(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    if (!manageManagerId) { setMessage("Please select a manager first."); return; }
    const res = await fetch("/api/verifiers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: manageManagerId, targetRole: "manager", companyIds: manageManagerCompanyIds }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) { setMessage(data.error ?? "Could not update manager company access."); return; }
    setMessage(data.message ?? "Manager company access updated.");
    await loadVerifierData();
  }

  async function bulkAssignManager(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    if (!bulkManagerId) { setMessage("Please select a target manager."); return; }
    const res = await fetch("/api/verifiers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerId: bulkManagerId, verifierIds: bulkVerifierIds }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) { setMessage(data.error ?? "Could not assign manager to selected verifiers."); return; }
    setMessage(data.message ?? "Manager assignment updated.");
    setBulkVerifierIds([]);
    await loadVerifierData();
  }

  // Sub-renders
  const renderRoster = () => (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <h3 style={{ marginTop: 0, marginBottom: "0.5rem", color: "#1E293B", fontSize: "1.1rem" }}>Reporting Roster</h3>
      <p style={{ color: "#64748B", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
        {isManagerView ? "Your verifier team is listed for quick delegation visibility." : "Managers are listed with their subordinate verifiers for clear team ownership."}
      </p>

      {managers.length === 0 && unassignedVerifiers.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "4rem", color: "#94A3B8" }}>No verifiers found.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {rosterRows.map((row) => (
          <div key={row.manager.id} style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E2E8F0", padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ background: "#F3E8FF", padding: "0.5rem", borderRadius: "8px" }}>
                <Briefcase size={20} color="#9333EA" />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#1E293B" }}>{row.manager.name}</h4>
                <div style={{ fontSize: "0.85rem", color: "#64748B" }}>Manager • {row.manager.email}</div>
              </div>
              <div style={{ background: "#F1F5F9", color: "#475569", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 600 }}>
                {row.verifiers.length} Verifiers
              </div>
            </div>
            
            {row.verifiers.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
                {row.verifiers.map((v) => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "#F8FAFC", border: "1px solid #E2E8F0", padding: "0.75rem", borderRadius: "8px", transition: "all 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "#CBD5E1"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "#E2E8F0"}>
                     <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#4A90E2", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 600 }}>
                       {v.name.charAt(0).toUpperCase()}
                     </div>
                     <div style={{ overflow: "hidden" }}>
                        <div style={{ margin: 0, fontSize: "0.95rem", color: "#334155", fontWeight: 500, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{v.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "#94A3B8", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{v.email}</div>
                     </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#94A3B8", fontSize: "0.9rem" }}>No verifiers assigned to this manager.</div>
            )}
          </div>
        ))}

        {unassignedVerifiers.length > 0 && (
          <div style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #FCA5A5", padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #FEE2E2" }}>
              <div style={{ background: "#FEE2E2", padding: "0.5rem", borderRadius: "8px" }}>
                <AlertCircle size={20} color="#DC2626" />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#991B1B" }}>Unassigned Verifiers</h4>
                <div style={{ fontSize: "0.85rem", color: "#B91C1C" }}>Needs Manager Assignment</div>
              </div>
              <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 600 }}>
                {unassignedVerifiers.length} Verifiers
              </div>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
              {unassignedVerifiers.map((v) => (
                <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "#FEF2F2", border: "1px solid #FCA5A5", padding: "0.75rem", borderRadius: "8px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#DC2626", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 600 }}>
                      {v.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ margin: 0, fontSize: "0.95rem", color: "#7F1D1D", fontWeight: 500, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{v.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "#991B1B", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{v.email}</div>
                    </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderCreation = () => (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E2E8F0", padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <h3 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "1.1rem", color: "#1E293B", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <Plus size={18} color="#4A90E2" /> Create Verifier Profile
        </h3>
        <form onSubmit={createVerifier} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
            <div>
              <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Verifier Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required style={{ background: "#F8FAFC", width: "100%" }} />
            </div>
            <div>
              <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Verifier Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ background: "#F8FAFC", width: "100%" }} />
            </div>
            <div>
              <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Password</label>
              <input className="input" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required style={{ background: "#F8FAFC", width: "100%" }} />
            </div>
            <div>
              <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Assign Manager</label>
              <select className="input" value={createManagerId} onChange={(e) => setCreateManagerId(e.target.value)} style={{ background: "#F8FAFC", width: "100%" }}>
                <option value="">Unassigned (No manager)</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                ))}
              </select>
            </div>
          </div>
          
          <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: "1rem" }}>
            <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "0.5rem" }}>Grant Company Access At Creation</label>
            {companies.length === 0 && <div style={{ color: "#94A3B8", fontSize: "0.9rem" }}>No companies found. Create companies first.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.5rem" }}>
              {companies.map((c) => (
                 <label key={`create-${c.id}`} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem", color: "#334155", background: createCompanyIds.includes(c.id) ? "#EFF6FF" : "#F8FAFC", padding: "0.5rem", borderRadius: "6px", border: "1px solid", borderColor: createCompanyIds.includes(c.id) ? "#C7D2FE" : "#E2E8F0", cursor: "pointer", transition: "all 0.2s" }}>
                    <input type="checkbox" checked={createCompanyIds.includes(c.id)} onChange={(e) => toggleCreateCompany(c.id, e.target.checked)} style={{ margin: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                 </label>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 1.5rem" }}>
              <Plus size={18} /> Create Verifier
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderAccess = () => (
    <div style={{ animation: "fadeIn 0.3s ease", display: "grid", gap: "1.5rem" }}>
      {/* Verifier Access */}
      <div style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E2E8F0", padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <h3 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "1.1rem", color: "#1E293B", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <Settings2 size={18} color="#4A90E2" /> Manage Verifier Access
        </h3>
        <form onSubmit={updateAccess}>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Target Verifier</label>
            <SearchableSelect
              className="w-full max-w-[400px]"
              options={verifierAccessOptions}
              value={manageVerifierId}
              placeholder="Select Verifier..."
              visibleOptionCount={5}
              onChange={(id) => {
                setManageVerifierId(id);
                const verifier = verifiers.find((item) => item.id === id);
                setManageCompanyIds(verifier ? verifier.assignedCompanies.map((c) => c.id) : []);
                setPromoteVerifierToManager(false);
              }}
            />
          </div>

          {manageVerifierId && (
            <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.65rem",
                  fontSize: "0.9rem",
                  color: "#334155",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={promoteVerifierToManager}
                  onChange={(e) => setPromoteVerifierToManager(e.target.checked)}
                  style={{ margin: 0 }}
                />
                Make selected verifier a manager
              </label>
              {promoteVerifierToManager ? (
                <p style={{ margin: "0 0 0.6rem", fontSize: "0.8rem", color: "#64748B" }}>
                  On save, this verifier will be promoted to manager, removed from their current manager, and shown under managers.
                </p>
              ) : null}

              <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "0.5rem" }}>Toggle Company Access</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.5rem" }}>
                {companies.map((c) => (
                  <label key={`manage-${c.id}`} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem", color: "#334155", background: manageCompanyIds.includes(c.id) ? "#EFF6FF" : "#F8FAFC", padding: "0.5rem", borderRadius: "6px", border: "1px solid", borderColor: manageCompanyIds.includes(c.id) ? "#C7D2FE" : "#E2E8F0", cursor: "pointer", transition: "all 0.2s" }}>
                      <input type="checkbox" checked={manageCompanyIds.includes(c.id)} onChange={(e) => toggleManageCompany(c.id, e.target.checked)} style={{ margin: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <button className="btn btn-primary" type="submit" disabled={!manageVerifierId}>
              {promoteVerifierToManager ? "Make Manager" : "Save Verifier Access"}
            </button>
          </div>
        </form>
      </div>

      {!isManagerView && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {/* Manager Access */}
          <div style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E2E8F0", padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "1.1rem", color: "#1E293B", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Settings2 size={18} color="#9333EA" /> Assign Companies To Manager
            </h3>
            <form onSubmit={updateManagerAccess}>
              <div style={{ marginBottom: "1rem" }}>
                <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Target Manager</label>
                <select className="input" value={manageManagerId} onChange={(e) => {
                  const id = e.target.value; setManageManagerId(id);
                  const m = managers.find((item) => item.id === id);
                  setManageManagerCompanyIds(m ? m.assignedCompanies.map((c) => c.id) : []);
                }} required style={{ background: "#F8FAFC", width: "100%" }}>
                  <option value="">Select Manager...</option>
                  {managers.map((m) => (
                    <option key={`m-${m.id}`} value={m.id}>{m.name} ({m.email})</option>
                  ))}
                </select>
              </div>

              {manageManagerId && (
                <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
                  <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "0.5rem" }}>Toggle Company Access</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "150px", overflowY: "auto", paddingRight: "0.5rem" }}>
                    {companies.map((c) => (
                      <label key={`mm-${c.id}`} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem", color: "#334155", background: manageManagerCompanyIds.includes(c.id) ? "#EFF6FF" : "#F8FAFC", padding: "0.4rem", borderRadius: "6px", border: "1px solid", borderColor: manageManagerCompanyIds.includes(c.id) ? "#C7D2FE" : "#E2E8F0", cursor: "pointer", transition: "all 0.2s" }}>
                          <input type="checkbox" checked={manageManagerCompanyIds.includes(c.id)} onChange={(e) => toggleManageManagerCompany(c.id, e.target.checked)} style={{ margin: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn btn-primary" type="submit" disabled={!manageManagerId} style={{ width: "100%", background: "#9333EA", borderColor: "#9333EA" }}>
                Save Manager Access
              </button>
            </form>
          </div>

          {/* Bulk Assign Verifiers to Manager */}
          <div style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E2E8F0", padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "1.1rem", color: "#1E293B", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Users size={18} color="#16A34A" /> Bulk Assign Verifiers
            </h3>
            <form onSubmit={bulkAssignManager}>
              <div style={{ marginBottom: "1rem" }}>
                <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Target Manager</label>
                <select className="input" value={bulkManagerId} onChange={(e) => setBulkManagerId(e.target.value)} required style={{ background: "#F8FAFC", width: "100%" }}>
                  <option value="">Unassign Manager</option>
                  {managers.map((m) => (
                    <option key={`bm-${m.id}`} value={m.id}>{m.name} ({m.email})</option>
                  ))}
                </select>
              </div>

              <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
                <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "0.5rem" }}>Select Verifiers</label>
                <p style={{ margin: "0 0 0.45rem", fontSize: "0.78rem", color: "#64748B" }}>
                  Verifiers already assigned to the selected manager are pre-checked. Untick any verifier to remove assignment.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "150px", overflowY: "auto", paddingRight: "0.5rem" }}>
                  {verifiers.map((v) => (
                    <label key={`bv-${v.id}`} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem", color: "#334155", background: bulkVerifierIds.includes(v.id) ? "#DCFCE7" : "#F8FAFC", padding: "0.4rem", borderRadius: "6px", border: "1px solid", borderColor: bulkVerifierIds.includes(v.id) ? "#86EFAC" : "#E2E8F0", cursor: "pointer", transition: "all 0.2s" }}>
                        <input type="checkbox" checked={bulkVerifierIds.includes(v.id)} onChange={(e) => toggleBulkVerifier(v.id, e.target.checked)} style={{ margin: 0 }} />
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{v.name}</div>
                          <div style={{ fontSize: "0.75rem", color: "#64748B", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Cur: {v.manager?.name ?? "None"}</div>
                        </div>
                    </label>
                  ))}
                </div>
              </div>

              <button className="btn btn-primary" type="submit" disabled={!bulkManagerId} style={{ width: "100%", background: "#16A34A", borderColor: "#16A34A" }}>
                Save Bulk Assignment
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section>
      <div 
        className="glass-card" 
        style={{ 
          padding: "1.5rem", 
          background: "rgba(255, 255, 255, 0.75)", 
          backdropFilter: "blur(12px)", 
          WebkitBackdropFilter: "blur(12px)", 
          border: "1px solid rgba(255, 255, 255, 0.4)", 
          borderRadius: "16px",
          boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.07)",
          position: "relative"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <div>
            <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem", color: "#1E293B", fontSize: "1.25rem" }}>
              <UserCheck size={24} color="#4A90E2" />
              Verifier Management
            </h2>
            <p style={{ color: "#64748B", margin: 0, fontSize: "0.95rem" }}>
              {isManagerView ? "Delegate access and track verifiers." : "Create verifiers, build your roster, and manage access layers."}
            </p>
          </div>
          
          {/* Tab Navigation */}
          <div style={{ display: "flex", background: "#F1F5F9", padding: "0.25rem", borderRadius: "10px", gap: "0.25rem" }}>
            <button onClick={() => setActiveTab("roster")} style={{ border: "none", background: activeTab === "roster" ? "#FFFFFF" : "transparent", color: activeTab === "roster" ? "#0F172A" : "#64748B", padding: "0.5rem 1rem", borderRadius: "8px", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", transition: "all 0.2s", boxShadow: activeTab === "roster" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Users size={16} /> Roster
            </button>
            {!isManagerView && (
              <button onClick={() => setActiveTab("creation")} style={{ border: "none", background: activeTab === "creation" ? "#FFFFFF" : "transparent", color: activeTab === "creation" ? "#0F172A" : "#64748B", padding: "0.5rem 1rem", borderRadius: "8px", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", transition: "all 0.2s", boxShadow: activeTab === "creation" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Plus size={16} /> Create
              </button>
            )}
            <button onClick={() => setActiveTab("access")} style={{ border: "none", background: activeTab === "access" ? "#FFFFFF" : "transparent", color: activeTab === "access" ? "#0F172A" : "#64748B", padding: "0.5rem 1rem", borderRadius: "8px", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", transition: "all 0.2s", boxShadow: activeTab === "access" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Settings2 size={16} /> Access
            </button>
          </div>
        </div>

        {message && (
          <div style={{ padding: "0.8rem", background: "#F1F5F9", borderLeft: "4px solid #4A90E2", borderRadius: "0 0.4rem 0.4rem 0", marginBottom: "1.5rem", color: "#334155", fontWeight: 500, animation: "fadeIn 0.3s ease" }}>
            {message}
          </div>
        )}

        <div style={{ minHeight: "400px" }}>
          {activeTab === "roster" && renderRoster()}
          {activeTab === "creation" && !isManagerView && renderCreation()}
          {activeTab === "access" && renderAccess()}
        </div>
      </div>
    </section>
  );
}
