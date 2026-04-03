"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Building,
  ChevronDown,
  ChevronUp,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  UserCircle2,
  UserPlus,
} from "lucide-react";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { SearchableSelect } from "@/components/SearchableSelect";
import { getAlertTone } from "@/lib/alerts";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "@/lib/currencies";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import {
  CompanyItem,
  CompanyPartnerProfile,
  CompanyServiceSelection,
  ServiceItem,
} from "@/lib/types";

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
  const [viewCompanyId, setViewCompanyId] = useState("");

  const [issueServiceSearch, setIssueServiceSearch] = useState("");
  const [manageServiceSearch, setManageServiceSearch] = useState("");
  const [issueServicesCollapsed, setIssueServicesCollapsed] = useState(true);  
  const [manageServicesCollapsed, setManageServicesCollapsed] = useState(true); 

  const [profilePanelsCollapsed, setProfilePanelsCollapsed] = useState({
    company: true,
    invoicing: true,
    contact: true,
    questions: true,
  });

  const toggleProfilePanel = (panel: keyof typeof profilePanelsCollapsed) => {
    setProfilePanelsCollapsed((prev) => ({
      ...prev,
      [panel]: !prev[panel],
    }));
  };

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

  useEffect(() => {
    if (companies.length === 0) {
      if (viewCompanyId) {
        setViewCompanyId("");
      }
      return;
    }

    const stillExists = companies.some((company) => company.id === viewCompanyId);
    if (!stillExists) {
      setViewCompanyId(companies[0].id);
    }
  }, [companies, viewCompanyId]);

  function formatAddress(address: CompanyPartnerProfile["companyInformation"]["address"]) {
    const parts = [address.line1, address.line2, address.city, address.state, address.postalCode, address.country]
      .map((part) => part.trim())
      .filter(Boolean);

    return parts.length > 0 ? parts.join(", ") : "-";
  }

  function formatPhone(phone: CompanyPartnerProfile["primaryContactInformation"]["mobilePhone"]) {
    const countryCode = phone.countryCode.trim();
    const number = phone.number.trim();
    if (!countryCode && !number) {
      return "-";
    }

    return [countryCode, number].filter(Boolean).join(" ");
  }

  function hasPartnerProfileData(profile: CompanyPartnerProfile) {
    return Boolean(
      profile.companyInformation.companyName.trim() ||
        profile.companyInformation.gstin.trim() ||
        profile.companyInformation.cinRegistrationNumber.trim() ||
        formatAddress(profile.companyInformation.address) !== "-" ||
        profile.companyInformation.documents.length > 0 ||
        profile.invoicingInformation.invoiceEmail.trim() ||
        formatAddress(profile.invoicingInformation.address) !== "-" ||
        profile.primaryContactInformation.firstName.trim() ||
        profile.primaryContactInformation.lastName.trim() ||
        profile.primaryContactInformation.designation.trim() ||
        profile.primaryContactInformation.email.trim() ||
        profile.additionalQuestions.heardAboutUs.trim() ||
        profile.additionalQuestions.referredBy.trim() ||
        profile.additionalQuestions.yearlyBackgroundsExpected.trim() ||
        profile.additionalQuestions.promoCode.trim() ||
        profile.additionalQuestions.primaryIndustry.trim(),
    );
  }

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
    setViewCompanyId(companyId);
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

  const selectedCompanyForInfo = companies.find((company) => company.id === viewCompanyId) ?? null;
  const selectedCompanyProfile = selectedCompanyForInfo?.partnerProfile ?? null;
  const canShowProfile = selectedCompanyProfile ? hasPartnerProfileData(selectedCompanyProfile) : false;

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
              <SearchableSelect
                value={manageCompanyId}
                onChange={(val) => pickCompanyForServiceUpdate(val)}
                options={companies.map((c) => ({ value: c.id, label: `${c.name} (${c.email})` }))}
                placeholder="Choose company..."
              />
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

      <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Building size={24} color="#4A90E2" />
          Company Information Access
        </h2>
        <p style={{ color: "#6C757D", marginTop: "0.2rem" }}>
          View company profile details submitted from partner settings.
        </p>

        <div
          style={{
            display: "grid",
            gap: "0.7rem",
            gridTemplateColumns: "minmax(250px, 420px) auto",
            alignItems: "end",
            marginTop: "0.75rem",
          }}
        >
          <div>
            <label className="label">Select Company</label>
              <SearchableSelect
                value={viewCompanyId}
                onChange={(val) => setViewCompanyId(val)}
                options={companies.map((company) => ({ value: company.id, label: `${company.name} (${company.email})` }))}
                placeholder="Choose company..."
              />
            </div>
          {selectedCompanyProfile?.updatedAt ? (
            <span className="neo-badge" style={{ justifySelf: "start" }}>
              Profile updated {new Date(selectedCompanyProfile.updatedAt).toLocaleString()}
            </span>
          ) : null}
        </div>

        {!selectedCompanyForInfo ? (
          <p style={{ color: "#6C757D", margin: "0.9rem 0 0" }}>No company selected.</p>
        ) : !selectedCompanyProfile || !canShowProfile ? (
          <p className="inline-alert inline-alert-warning" style={{ marginTop: "0.9rem" }}>
            {selectedCompanyForInfo.name} has not filled their profile information yet.
          </p>
        ) : (
          <div
            style={{
              marginTop: "0.9rem",
              display: "grid",
              gap: "0.75rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            <article className="glass-card" style={{ padding: "0.85rem" }}>
              <h3 style={{ margin: 0, fontSize: "0.98rem", color: "#2D405E", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Building size={16} color="#4A90E2" /> Company Information
              </h3>
              <div style={{ marginTop: "0.55rem", display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
                <div><strong>Company Name:</strong> {selectedCompanyProfile.companyInformation.companyName || selectedCompanyForInfo.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <Mail size={14} color="#5E7A9A" />
                  <span><strong>Login Email:</strong> {selectedCompanyForInfo.email}</span>
                </div>
                <div><strong>GSTIN:</strong> {selectedCompanyProfile.companyInformation.gstin || "-"}</div>
                <div><strong>CIN / Registration:</strong> {selectedCompanyProfile.companyInformation.cinRegistrationNumber || "-"}</div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.35rem" }}>
                  <MapPin size={14} color="#5E7A9A" style={{ marginTop: "0.18rem" }} />
                  <span><strong>Address:</strong> {formatAddress(selectedCompanyProfile.companyInformation.address)}</span>
                </div>

                <div style={{ marginTop: "0.3rem" }}>
                  <strong>Documents:</strong>
                  {selectedCompanyProfile.companyInformation.documents.length > 0 ? (
                    <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", display: "grid", gap: "0.2rem" }}>
                      {selectedCompanyProfile.companyInformation.documents.map((doc, index) => (
                        <li key={`${doc.fileName}-${doc.fileSize}-${index}`} style={{ display: "flex", alignItems: "center", gap: "0.32rem" }}>
                          <FileText size={14} color="#5E7A9A" />
                          <span>
                            {doc.fileName} ({(doc.fileSize / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span> -</span>
                  )}
                </div>
              </div>
            </article>

            <article className="glass-card" style={{ padding: "0.85rem" }}>
              <h3 style={{ margin: 0, fontSize: "0.98rem", color: "#2D405E" }}>Invoicing Information</h3>
              <div style={{ marginTop: "0.55rem", display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
                <div><strong>Invoice Email:</strong> {selectedCompanyProfile.invoicingInformation.invoiceEmail || "-"}</div>
                <div><strong>Billing same as company:</strong> {selectedCompanyProfile.invoicingInformation.billingSameAsCompany ? "Yes" : "No"}</div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.35rem" }}>
                  <MapPin size={14} color="#5E7A9A" style={{ marginTop: "0.18rem" }} />
                  <span><strong>Billing Address:</strong> {formatAddress(selectedCompanyProfile.invoicingInformation.address)}</span>
                </div>
              </div>
            </article>

            <article className="glass-card" style={{ padding: "0.85rem" }}>
              <h3 style={{ margin: 0, fontSize: "0.98rem", color: "#2D405E", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <UserCircle2 size={16} color="#4A90E2" /> Primary Contact Information
              </h3>
              <div style={{ marginTop: "0.55rem", display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
                <div><strong>Name:</strong> {`${selectedCompanyProfile.primaryContactInformation.firstName} ${selectedCompanyProfile.primaryContactInformation.lastName}`.trim() || "-"}</div>
                <div><strong>Designation:</strong> {selectedCompanyProfile.primaryContactInformation.designation || "-"}</div>
                <div><strong>Email:</strong> {selectedCompanyProfile.primaryContactInformation.email || "-"}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <Phone size={14} color="#5E7A9A" />
                  <span><strong>Office:</strong> {formatPhone(selectedCompanyProfile.primaryContactInformation.officePhone)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <Phone size={14} color="#5E7A9A" />
                  <span><strong>Mobile:</strong> {formatPhone(selectedCompanyProfile.primaryContactInformation.mobilePhone)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <Phone size={14} color="#5E7A9A" />
                  <span><strong>WhatsApp:</strong> {formatPhone(selectedCompanyProfile.primaryContactInformation.whatsappPhone)}</span>
                </div>
              </div>
            </article>

            <article className="glass-card" style={{ padding: "0.85rem" }}>
              <h3 style={{ margin: 0, fontSize: "0.98rem", color: "#2D405E" }}>Additional Questions</h3>
              <div style={{ marginTop: "0.55rem", display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
                <div><strong>How did you hear about us:</strong> {selectedCompanyProfile.additionalQuestions.heardAboutUs || "-"}</div>
                <div><strong>Referred By:</strong> {selectedCompanyProfile.additionalQuestions.referredBy || "-"}</div>
                <div><strong>Expected Backgrounds / Year:</strong> {selectedCompanyProfile.additionalQuestions.yearlyBackgroundsExpected || "-"}</div>
                <div><strong>Promo Code:</strong> {selectedCompanyProfile.additionalQuestions.promoCode || "-"}</div>
                <div><strong>Primary Industry:</strong> {selectedCompanyProfile.additionalQuestions.primaryIndustry || "-"}</div>
              </div>
            </article>
          </div>
        )}
      </section>

      <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          Company Request Roster
        </h2>
        <div style={{ overflowX: "auto", border: "1px solid #E2E8F0", borderRadius: "10px", background: "#fff", marginTop: "1rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0", background: "#F8FAFC", color: "#475569" }}>
                <th style={{ padding: "0.8rem", fontWeight: 600 }}>Company</th>
                <th style={{ padding: "0.8rem", fontWeight: 600 }}>Requests Volume</th>
                <th style={{ padding: "0.8rem", fontWeight: 600 }}>Latest Request Date</th>
                <th style={{ padding: "0.8rem", fontWeight: 600 }}>Profile Status</th>
                <th style={{ padding: "0.8rem", fontWeight: 600 }}>Assigned Verifiers</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id} style={{ borderBottom: "1px solid #E2E8F0" }}>
                  <td style={{ padding: "0.8rem" }}>
                    <strong style={{ color: "#1E293B" }}>{company.name}</strong>
                    <div style={{ fontSize: "0.8rem", color: "#64748B" }}>{company.email}</div>
                  </td>
                  <td style={{ padding: "0.8rem" }}>
                    <span style={{ padding: "0.2rem 0.6rem", background: company.stats?.totalRequests ? "#DBEAFE" : "#F1F5F9", color: company.stats?.totalRequests ? "#1D4ED8" : "#64748B", borderRadius: "999px", fontWeight: 600, fontSize: "0.85rem" }}>
                      {company.stats?.totalRequests || 0}
                    </span>
                  </td>
                  <td style={{ padding: "0.8rem" }}>{company.stats?.lastRequestDate ? new Date(company.stats.lastRequestDate).toLocaleDateString() : <span style={{ color: "#94A3B8", fontStyle: "italic" }}>None</span>}</td>
                  <td style={{ padding: "0.8rem" }}>
                    {company.partnerProfile && hasPartnerProfileData(company.partnerProfile) ? (
                      <span style={{ padding: "0.25rem 0.5rem", background: "#f0fdf4", color: "#166534", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, border: "1px solid #bbf7d0" }}>
                        Submitted
                      </span>
                    ) : (
                      <span style={{ padding: "0.25rem 0.5rem", background: "#fef2f2", color: "#991b1b", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, border: "1px solid #fecaca" }}>
                        Pending
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "0.8rem" }}>
                    {company.stats?.assignedVerifiers?.length ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                        {company.stats.assignedVerifiers.map((v, i) => (
                          <span key={i} style={{ padding: "0.2rem 0.5rem", background: "#F8FAFC", border: "1px solid #CBD5E1", borderRadius: "4px", fontSize: "0.8rem", color: "#334155" }}>
                            {v}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: "#94A3B8", fontStyle: "italic", fontSize: "0.85rem" }}>Unassigned</span>
                    )}
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#64748B" }}>
                    No partner companies found in the database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPortalFrame>
  );
}
