"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Building, ChevronDown, ChevronUp, Plus, Save, UserPlus } from "lucide-react";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { getAlertTone } from "@/lib/alerts";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "@/lib/currencies";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import { CompanyItem, CompanyServiceSelection, ServiceItem } from "@/lib/types";

export default function CompaniesPage() {
  const { me, loading, logout } = useAdminSession();
  const [message, setMessage] = useState("");
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);

  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPassword, setCompanyPassword] = useState("");
  const [selectedCompanyServices, setSelectedCompanyServices] = useState<CompanyServiceSelection[]>([]);

  const [manageCompanyId, setManageCompanyId] = useState("");
  const [manageCompanyServices, setManageCompanyServices] = useState<CompanyServiceSelection[]>([]);

  const [issueServiceSearch, setIssueServiceSearch] = useState("");
  const [manageServiceSearch, setManageServiceSearch] = useState("");
  const [issueServicesCollapsed, setIssueServicesCollapsed] = useState(false);
  const [manageServicesCollapsed, setManageServicesCollapsed] = useState(true);

  const loadData = useCallback(async () => {
    const [serviceRes, companyRes] = await Promise.all([
      fetch("/api/services", { cache: "no-store" }),
      fetch("/api/customers", { cache: "no-store" }),
    ]);

    if (serviceRes.ok) {
      const serviceJson = (await serviceRes.json()) as { items: ServiceItem[] };
      setServices(serviceJson.items);
    }

    if (companyRes.ok) {
      const companyJson = (await companyRes.json()) as { items: CompanyItem[] };
      setCompanies(companyJson.items);
    }
  }, []);

  useEffect(() => {
    if (!me || (me.role !== "admin" && me.role !== "superadmin")) {
      return;
    }

    let active = true;
    (async () => {
      await loadData();
      if (!active) {
        return;
      }
    })();

    return () => {
      active = false;
    };
  }, [me, loadData]);

  function toggleCompanyService(service: ServiceItem, checked: boolean) {
    if (checked) {
      setSelectedCompanyServices((prev) => {
        if (prev.some((item) => item.serviceId === service.id)) {
          return prev;
        }

        return [
          ...prev,
          {
            serviceId: service.id,
            serviceName: service.name,
            price: service.defaultPrice ?? 0,
            currency: service.defaultCurrency,
          },
        ];
      });
      return;
    }

    setSelectedCompanyServices((prev) => prev.filter((item) => item.serviceId !== service.id));
  }

  function updateCompanyServicePrice(serviceId: string, value: string) {
    const parsed = Number(value);
    setSelectedCompanyServices((prev) =>
      prev.map((item) =>
        item.serviceId === serviceId
          ? {
              ...item,
              price: Number.isNaN(parsed) ? 0 : parsed,
            }
          : item,
      ),
    );
  }

  function updateCompanyServiceCurrency(serviceId: string, currency: SupportedCurrency) {
    setSelectedCompanyServices((prev) =>
      prev.map((item) => (item.serviceId === serviceId ? { ...item, currency } : item)),
    );
  }

  function toggleManageCompanyService(service: ServiceItem, checked: boolean) {
    if (checked) {
      setManageCompanyServices((prev) => {
        if (prev.some((item) => item.serviceId === service.id)) {
          return prev;
        }

        return [
          ...prev,
          {
            serviceId: service.id,
            serviceName: service.name,
            price: service.defaultPrice ?? 0,
            currency: service.defaultCurrency,
          },
        ];
      });
      return;
    }

    setManageCompanyServices((prev) => prev.filter((item) => item.serviceId !== service.id));
  }

  function updateManageCompanyServicePrice(serviceId: string, value: string) {
    const parsed = Number(value);
    setManageCompanyServices((prev) =>
      prev.map((item) =>
        item.serviceId === serviceId
          ? {
              ...item,
              price: Number.isNaN(parsed) ? 0 : parsed,
            }
          : item,
      ),
    );
  }

  function updateManageCompanyServiceCurrency(serviceId: string, currency: SupportedCurrency) {
    setManageCompanyServices((prev) =>
      prev.map((item) => (item.serviceId === serviceId ? { ...item, currency } : item)),
    );
  }

  function pickCompanyForServiceUpdate(companyId: string) {
    setManageCompanyId(companyId);
    const found = companies.find((item) => item.id === companyId);
    setManageCompanyServices(found?.selectedServices ?? []);
  }

  async function createCustomer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: companyName,
        email: companyEmail,
        password: companyPassword,
        selectedServices: selectedCompanyServices,
      }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Could not create customer account.");
      return;
    }

    setCompanyName("");
    setCompanyEmail("");
    setCompanyPassword("");
    setSelectedCompanyServices([]);
    setMessage(data.message ?? "Customer account created.");
    await loadData();
  }

  async function updateCompanyServices(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!manageCompanyId) {
      setMessage("Please choose a company first.");
      return;
    }

    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: manageCompanyId,
        selectedServices: manageCompanyServices,
      }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Could not update company services.");
      return;
    }

    setMessage(data.message ?? "Company services updated.");
    await loadData();
  }

  if (loading || !me) {
    return <main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>;
  }

  if (me.role !== "admin" && me.role !== "superadmin") {
    return (
      <AdminPortalFrame
        me={me}
        onLogout={logout}
        title="Company Access"
        subtitle="Admin permissions required."
      >
        <section className="glass-card" style={{ padding: "1.2rem" }}>
          <p className="inline-alert inline-alert-warning" style={{ margin: 0 }}>
            You do not have permission to manage company accounts.
          </p>
        </section>
      </AdminPortalFrame>
    );
  }

  const normalizedIssueServiceSearch = issueServiceSearch.trim().toLowerCase();
  const normalizedManageServiceSearch = manageServiceSearch.trim().toLowerCase();

  const filteredIssueServices = services.filter((service) => {
    const selected = selectedCompanyServices.some((item) => item.serviceId === service.id);
    if (selected) {
      return true;
    }

    if (!normalizedIssueServiceSearch) {
      return true;
    }

    const searchable = `${service.name} ${service.description}`.toLowerCase();
    return searchable.includes(normalizedIssueServiceSearch);
  });

  const filteredManageServices = services.filter((service) => {
    const selected = manageCompanyServices.some((item) => item.serviceId === service.id);
    if (selected) {
      return true;
    }

    if (!normalizedManageServiceSearch) {
      return true;
    }

    const searchable = `${service.name} ${service.description}`.toLowerCase();
    return searchable.includes(normalizedManageServiceSearch);
  });

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Company Access"
      subtitle="Issue and update company login/service assignments in one dedicated workspace."
    >
      {message ? <p className={`inline-alert ${getAlertTone(message)}`}>{message}</p> : null}

      <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <UserPlus size={24} color="#4A90E2" />
          Issue Company Login ID
        </h2>
        <p style={{ color: "#6C757D" }}>
          Create a customer company account. Select services and set custom price per company.
        </p>
        <form
          onSubmit={createCustomer}
          style={{
            display: "grid",
            gap: "0.8rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <div>
            <label className="label">Company Name</label>
            <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Company Login Email</label>
            <input className="input" type="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={companyPassword} onChange={(e) => setCompanyPassword(e.target.value)} required />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className="label">Assign Services With Company-Specific Price</label>
            <p style={{ margin: "0.2rem 0 0.6rem", color: "#6C757D", fontSize: "0.9rem" }}>
              Select service, then set both rate and currency for this company.
            </p>
            {services.length === 0 ? (
              <div style={{ color: "#6C757D" }}>Add services in Service Catalog before creating company accounts.</div>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "minmax(240px, 1fr) auto", alignItems: "end" }}>
                  <div>
                    <label className="label">Search Services</label>
                    <input className="input" placeholder="Search by service name" value={issueServiceSearch} onChange={(e) => setIssueServiceSearch(e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={() => setIssueServicesCollapsed((prev) => !prev)} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    {issueServicesCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    {issueServicesCollapsed ? "Expand Services" : "Collapse Services"}
                  </button>
                </div>

                {!issueServicesCollapsed && filteredIssueServices.length === 0 && <div style={{ color: "#6C757D" }}>No services match your search.</div>}

                {!issueServicesCollapsed && filteredIssueServices.map((service) => {
                  const selected = selectedCompanyServices.find((item) => item.serviceId === service.id);
                  return (
                    <div key={service.id} style={{ border: "1px solid #E0E0E0", borderRadius: "0.65rem", padding: "0.75rem", background: "#F8F9FA" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
                        <input type="checkbox" checked={Boolean(selected)} onChange={(e) => toggleCompanyService(service, e.target.checked)} />
                        {service.name}
                      </label>
                      {service.isPackage ? (
                        <div style={{ marginTop: "0.2rem", color: "#1E4DB7", fontWeight: 600, fontSize: "0.84rem" }}>
                          Package deal ({service.includedServiceIds.length} services)
                        </div>
                      ) : null}
                      <div style={{ color: "#6C757D", marginTop: "0.25rem" }}>{service.description || "No description"}</div>

                      {selected ? (
                        <div style={{ marginTop: "0.6rem", display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                          <div>
                            <label className="label">Price</label>
                            <input className="input" type="number" min={0} step="0.01" value={selected.price} onChange={(e) => updateCompanyServicePrice(service.id, e.target.value)} required />
                          </div>
                          <div>
                            <label className="label">Currency</label>
                            <select className="input" value={selected.currency} onChange={(e) => updateCompanyServiceCurrency(service.id, e.target.value as SupportedCurrency)}>
                              {SUPPORTED_CURRENCIES.map((currency) => (
                                <option key={currency} value={currency}>{currency}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "end" }}>
            <button className="btn btn-primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
              <Plus size={18} />
              Create Company Account
            </button>
          </div>
        </form>
      </section>

      <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Building size={24} color="#4A90E2" />
          Update Existing Company Services
        </h2>
        <p style={{ color: "#6C757D" }}>
          Use this for companies already created earlier.
        </p>

        <form onSubmit={updateCompanyServices} style={{ display: "grid", gap: "0.8rem" }}>
          <div>
            <label className="label">Select Company</label>
            <select className="input" value={manageCompanyId} onChange={(e) => pickCompanyForServiceUpdate(e.target.value)} required>
              <option value="">Choose company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name} ({company.email})</option>
              ))}
            </select>
          </div>

          {manageCompanyId && services.length > 0 ? (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "minmax(240px, 1fr) auto", alignItems: "end" }}>
                <div>
                  <label className="label">Search Services</label>
                  <input className="input" placeholder="Search by service name" value={manageServiceSearch} onChange={(e) => setManageServiceSearch(e.target.value)} />
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => setManageServicesCollapsed((prev) => !prev)} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  {manageServicesCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  {manageServicesCollapsed ? "Expand Services" : "Collapse Services"}
                </button>
              </div>

              {!manageServicesCollapsed && filteredManageServices.length === 0 ? <div style={{ color: "#6C757D" }}>No services match your search.</div> : null}

              {!manageServicesCollapsed && filteredManageServices.map((service) => {
                const selected = manageCompanyServices.find((item) => item.serviceId === service.id);
                return (
                  <div key={`manage-${service.id}`} style={{ border: "1px solid #E0E0E0", borderRadius: "0.65rem", padding: "0.75rem", background: "#F8F9FA" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
                      <input type="checkbox" checked={Boolean(selected)} onChange={(e) => toggleManageCompanyService(service, e.target.checked)} />
                      {service.name}
                    </label>
                    {service.isPackage ? (
                      <div style={{ marginTop: "0.2rem", color: "#1E4DB7", fontWeight: 600, fontSize: "0.84rem" }}>
                        Package deal ({service.includedServiceIds.length} services)
                      </div>
                    ) : null}

                    {selected ? (
                      <div style={{ marginTop: "0.6rem", display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                        <div>
                          <label className="label">Price</label>
                          <input className="input" type="number" min={0} step="0.01" value={selected.price} onChange={(e) => updateManageCompanyServicePrice(service.id, e.target.value)} required />
                        </div>
                        <div>
                          <label className="label">Currency</label>
                          <select className="input" value={selected.currency} onChange={(e) => updateManageCompanyServiceCurrency(service.id, e.target.value as SupportedCurrency)}>
                            {SUPPORTED_CURRENCIES.map((currency) => (
                              <option key={currency} value={currency}>{currency}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          <div>
            <button className="btn btn-primary" type="submit" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Save size={18} />
              Save Company Services
            </button>
          </div>
        </form>
      </section>
    </AdminPortalFrame>
  );
}
