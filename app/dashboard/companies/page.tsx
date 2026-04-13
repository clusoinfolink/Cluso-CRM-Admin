"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
  X,
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
import { useRouter } from "next/navigation";

export default function CompaniesPage() {
  const { me, loading, logout } = useAdminSession();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [saveServicesNotice, setSaveServicesNotice] = useState("");
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);

  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPassword, setCompanyPassword] = useState("");
  const [selectedCompanyServices, setSelectedCompanyServices] = useState<CompanyServiceSelection[]>([]);

  const [manageCompanyId, setManageCompanyId] = useState("");
  const [manageCompanyServices, setManageCompanyServices] = useState<CompanyServiceSelection[]>([]);
  const [viewCompanyId, setViewCompanyId] = useState("");
  const [profileModalCompanyId, setProfileModalCompanyId] = useState("");
  const [accessActionCompanyId, setAccessActionCompanyId] = useState("");

  const [issueServiceSearch, setIssueServiceSearch] = useState("");
  const [manageServiceSearch, setManageServiceSearch] = useState("");
  const [issueServicesCollapsed, setIssueServicesCollapsed] = useState(true);  
  const [manageServicesCollapsed, setManageServicesCollapsed] = useState(true); 
  const profileAccessSectionRef = useRef<HTMLElement | null>(null);

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
    const normalizedViewCompanyId =
      companies.length === 0
        ? ""
        : companies.some((company) => company.id === viewCompanyId)
          ? viewCompanyId
          : companies[0].id;

    if (normalizedViewCompanyId === viewCompanyId) {
      return;
    }

    const stateUpdateTimer = window.setTimeout(() => {
      setViewCompanyId(normalizedViewCompanyId);
    }, 0);

    return () => {
      window.clearTimeout(stateUpdateTimer);
    };
  }, [companies, viewCompanyId]);

  useEffect(() => {
    if (!profileModalCompanyId) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileModalCompanyId("");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [profileModalCompanyId]);

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

  function hasSavedProfile(profile: CompanyPartnerProfile) {
    return Boolean(profile.updatedAt) || hasPartnerProfileData(profile);
  }

  function openCompanyProfileFromRoster(companyId: string) {
    setViewCompanyId(companyId);
    profileAccessSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openCompanyProfileModal(companyId: string) {
    setViewCompanyId(companyId);
    setProfileModalCompanyId(companyId);
  }

  function openServiceFormBuilder(serviceId: string) {
    router.push(`/dashboard/services?tab=forms&serviceId=${encodeURIComponent(serviceId)}`);
  }

  function closeCompanyProfileModal() {
    setProfileModalCompanyId("");
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
    setSaveServicesNotice("");
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
      setMessage(data.error ?? "Could not create enterprise account.");
      return;
    }

    setCompanyName("");
    setCompanyEmail("");
    setCompanyPassword("");
    setSelectedCompanyServices([]);
    setMessage(data.message ?? "Enterprise account created.");
    await loadData();
  }

  async function updateCompanyServices(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setSaveServicesNotice("");

    if (!manageCompanyId) {
      setMessage("Please choose a company first.");
      return;
    }

    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-services",
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
    setSaveServicesNotice("Successfully saved");
    await loadData();
  }

  async function setCompanyAccessStatus(companyId: string, nextStatus: "active" | "inactive") {
    setMessage("");
    setAccessActionCompanyId(companyId);

    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set-company-access",
        customerId: companyId,
        companyAccessStatus: nextStatus,
      }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Could not update company access status.");
      setAccessActionCompanyId("");
      return;
    }

    setMessage(data.message ?? "Company access status updated.");
    setAccessActionCompanyId("");
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
  const canShowProfile = selectedCompanyProfile ? hasSavedProfile(selectedCompanyProfile) : false;
  const selectedCompanyForModal = companies.find((company) => company.id === profileModalCompanyId) ?? null;
  const selectedCompanyModalProfile = selectedCompanyForModal?.partnerProfile ?? null;
  const canShowModalProfile = selectedCompanyModalProfile ? hasSavedProfile(selectedCompanyModalProfile) : false;

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Company Access"
      subtitle="Issue and update company login/service assignments in one dedicated workspace."
    >
      {message ? <p className={`inline-alert ${getAlertTone(message)}`}>{message}</p> : null}

      <section ref={profileAccessSectionRef} className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <UserPlus size={24} color="#4A90E2" />
          Issue Company Login ID
        </h2>
        <p style={{ color: "#6C757D" }}>
          Create an enterprise company account. Select services and set custom price per company.
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

                {!issueServicesCollapsed && filteredIssueServices.length === 0 ? <div style={{ color: "#6C757D" }}>No services match your search.</div> : null}

                {!issueServicesCollapsed && filteredIssueServices.length > 0 ? (
                  <div
                    style={{
                      maxHeight: "430px",
                      overflowY: "auto",
                      border: "1px solid #E2E8F0",
                      borderRadius: "0.65rem",
                      padding: "0.55rem",
                      display: "grid",
                      gap: "0.6rem",
                    }}
                  >
                    {filteredIssueServices.map((service) => {
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
                ) : null}
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

              {!manageServicesCollapsed && filteredManageServices.length > 0 ? (
                <div
                  style={{
                    maxHeight: "430px",
                    overflowY: "auto",
                    border: "1px solid #E2E8F0",
                    borderRadius: "0.65rem",
                    padding: "0.55rem",
                    display: "grid",
                    gap: "0.6rem",
                  }}
                >
                  {filteredManageServices.map((service) => {
                    const selected = manageCompanyServices.find((item) => item.serviceId === service.id);
                    const hasServiceForm = !service.isPackage && service.formFields.length > 0;
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

                        <div style={{ color: "#6C757D", marginTop: "0.25rem" }}>{service.description || "No description"}</div>

                        {!service.isPackage ? (
                          <div style={{ marginTop: "0.45rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap" }}>
                            <span
                              style={{
                                fontSize: "0.8rem",
                                fontWeight: 700,
                                color: hasServiceForm ? "#166534" : "#991B1B",
                              }}
                            >
                              {hasServiceForm ? "Form created" : "Form not created"}
                            </span>
                            <button
                              type="button"
                              onClick={() => openServiceFormBuilder(service.id)}
                              title="Open service form builder"
                              style={{
                                padding: "0.25rem 0.65rem",
                                border: "none",
                                borderRadius: "999px",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                color: "#FFFFFF",
                                background: hasServiceForm ? "#16A34A" : "#DC2626",
                                cursor: "pointer",
                              }}
                            >
                              REF
                            </button>
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
            </div>
          ) : null}

          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="submit" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Save size={18} />
              Save Company Services
            </button>

            {saveServicesNotice ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "#DCFCE7",
                  color: "#166534",
                  border: "1px solid #BBF7D0",
                  borderRadius: "0.55rem",
                  padding: "0.45rem 0.65rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  lineHeight: 1.2,
                }}
              >
                {saveServicesNotice}
              </span>
            ) : null}
          </div>
        </form>
      </section>

      <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Building size={24} color="#4A90E2" />
          Company Information Access
        </h2>
        <p style={{ color: "#6C757D", marginTop: "0.2rem" }}>
          View company profile details submitted from enterprise settings.
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
                <th style={{ padding: "0.8rem", fontWeight: 600 }}>Portal Access</th>
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
                    {company.partnerProfile && hasSavedProfile(company.partnerProfile) ? (
                      <button
                        type="button"
                        onClick={() => openCompanyProfileModal(company.id)}
                        title="View full company profile"
                        style={{
                          padding: "0.25rem 0.5rem",
                          background: "#f0fdf4",
                          color: "#166534",
                          borderRadius: "999px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          border: "1px solid #bbf7d0",
                          cursor: "pointer",
                        }}
                      >
                        Submitted - View
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openCompanyProfileFromRoster(company.id)}
                        title="Open company profile"
                        style={{
                          padding: "0.25rem 0.5rem",
                          background: "#fef2f2",
                          color: "#991b1b",
                          borderRadius: "999px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          border: "1px solid #fecaca",
                          cursor: "pointer",
                        }}
                      >
                        Pending - Open
                      </button>
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
                  <td style={{ padding: "0.8rem" }}>
                    <div style={{ display: "grid", gap: "0.45rem", justifyItems: "start" }}>
                      <span
                        style={{
                          padding: "0.22rem 0.6rem",
                          borderRadius: "999px",
                          border: company.companyAccessStatus === "inactive" ? "1px solid #FECACA" : "1px solid #BBF7D0",
                          background: company.companyAccessStatus === "inactive" ? "#FEF2F2" : "#F0FDF4",
                          color: company.companyAccessStatus === "inactive" ? "#B91C1C" : "#166534",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                        }}
                      >
                        {company.companyAccessStatus === "inactive" ? "Deactivated" : "Active"}
                      </span>
                      <button
                        type="button"
                        disabled={accessActionCompanyId === company.id}
                        onClick={() => {
                          const nextStatus = company.companyAccessStatus === "inactive" ? "active" : "inactive";
                          const confirmed =
                            nextStatus === "inactive"
                              ? window.confirm(
                                  `Deactivate ${company.name}? Delegates and users will still log in but only Invoices and Settings will remain accessible.`,
                                )
                              : true;

                          if (!confirmed) {
                            return;
                          }

                          void setCompanyAccessStatus(company.id, nextStatus);
                        }}
                        style={{
                          padding: "0.25rem 0.65rem",
                          borderRadius: "7px",
                          border: "1px solid #CBD5E1",
                          background: "#FFFFFF",
                          color: "#1E293B",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: accessActionCompanyId === company.id ? "not-allowed" : "pointer",
                          opacity: accessActionCompanyId === company.id ? 0.65 : 1,
                        }}
                      >
                        {accessActionCompanyId === company.id
                          ? "Saving..."
                          : company.companyAccessStatus === "inactive"
                            ? "Activate"
                            : "Deactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "#64748B" }}>
                    No enterprise companies found in the database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {profileModalCompanyId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Company profile details"
          onClick={closeCompanyProfileModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            zIndex: 1200,
            display: "grid",
            placeItems: "center",
            padding: "1rem",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(1120px, 100%)",
              maxHeight: "92vh",
              overflowY: "auto",
              borderRadius: "14px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              boxShadow: "0 28px 72px rgba(15, 23, 42, 0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "start",
                justifyContent: "space-between",
                gap: "0.8rem",
                padding: "1rem 1rem 0.8rem",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "#0f172a" }}>Submitted Company Profile</h3>
                <p style={{ margin: "0.35rem 0 0", color: "#475569", fontSize: "0.92rem" }}>
                  {selectedCompanyForModal ? `${selectedCompanyForModal.name} (${selectedCompanyForModal.email})` : "Selected company"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCompanyProfileModal}
                aria-label="Close company profile popup"
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#334155",
                  borderRadius: "8px",
                  width: "34px",
                  height: "34px",
                  display: "inline-grid",
                  placeItems: "center",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "1rem" }}>
              {!selectedCompanyForModal ? (
                <p className="inline-alert inline-alert-warning" style={{ margin: 0 }}>
                  Company details are not available.
                </p>
              ) : !selectedCompanyModalProfile || !canShowModalProfile ? (
                <p className="inline-alert inline-alert-warning" style={{ margin: 0 }}>
                  {selectedCompanyForModal.name} has not filled their profile information yet.
                </p>
              ) : (
                <div
                  style={{
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
                      <div><strong>Company Name:</strong> {selectedCompanyModalProfile.companyInformation.companyName || selectedCompanyForModal.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <Mail size={14} color="#5E7A9A" />
                        <span><strong>Login Email:</strong> {selectedCompanyForModal.email}</span>
                      </div>
                      <div><strong>GSTIN:</strong> {selectedCompanyModalProfile.companyInformation.gstin || "-"}</div>
                      <div><strong>CIN / Registration:</strong> {selectedCompanyModalProfile.companyInformation.cinRegistrationNumber || "-"}</div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.35rem" }}>
                        <MapPin size={14} color="#5E7A9A" style={{ marginTop: "0.18rem" }} />
                        <span><strong>Address:</strong> {formatAddress(selectedCompanyModalProfile.companyInformation.address)}</span>
                      </div>

                      <div style={{ marginTop: "0.3rem" }}>
                        <strong>Documents:</strong>
                        {selectedCompanyModalProfile.companyInformation.documents.length > 0 ? (
                          <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", display: "grid", gap: "0.2rem" }}>
                            {selectedCompanyModalProfile.companyInformation.documents.map((doc, index) => (
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
                      <div><strong>Invoice Email:</strong> {selectedCompanyModalProfile.invoicingInformation.invoiceEmail || "-"}</div>
                      <div><strong>Billing same as company:</strong> {selectedCompanyModalProfile.invoicingInformation.billingSameAsCompany ? "Yes" : "No"}</div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.35rem" }}>
                        <MapPin size={14} color="#5E7A9A" style={{ marginTop: "0.18rem" }} />
                        <span><strong>Billing Address:</strong> {formatAddress(selectedCompanyModalProfile.invoicingInformation.address)}</span>
                      </div>
                    </div>
                  </article>

                  <article className="glass-card" style={{ padding: "0.85rem" }}>
                    <h3 style={{ margin: 0, fontSize: "0.98rem", color: "#2D405E", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <UserCircle2 size={16} color="#4A90E2" /> Primary Contact Information
                    </h3>
                    <div style={{ marginTop: "0.55rem", display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
                      <div><strong>Name:</strong> {`${selectedCompanyModalProfile.primaryContactInformation.firstName} ${selectedCompanyModalProfile.primaryContactInformation.lastName}`.trim() || "-"}</div>
                      <div><strong>Designation:</strong> {selectedCompanyModalProfile.primaryContactInformation.designation || "-"}</div>
                      <div><strong>Email:</strong> {selectedCompanyModalProfile.primaryContactInformation.email || "-"}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <Phone size={14} color="#5E7A9A" />
                        <span><strong>Office:</strong> {formatPhone(selectedCompanyModalProfile.primaryContactInformation.officePhone)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <Phone size={14} color="#5E7A9A" />
                        <span><strong>Mobile:</strong> {formatPhone(selectedCompanyModalProfile.primaryContactInformation.mobilePhone)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <Phone size={14} color="#5E7A9A" />
                        <span><strong>WhatsApp:</strong> {formatPhone(selectedCompanyModalProfile.primaryContactInformation.whatsappPhone)}</span>
                      </div>
                    </div>
                  </article>

                  <article className="glass-card" style={{ padding: "0.85rem" }}>
                    <h3 style={{ margin: 0, fontSize: "0.98rem", color: "#2D405E" }}>Additional Questions</h3>
                    <div style={{ marginTop: "0.55rem", display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
                      <div><strong>How did you hear about us:</strong> {selectedCompanyModalProfile.additionalQuestions.heardAboutUs || "-"}</div>
                      <div><strong>Referred By:</strong> {selectedCompanyModalProfile.additionalQuestions.referredBy || "-"}</div>
                      <div><strong>Expected Backgrounds / Year:</strong> {selectedCompanyModalProfile.additionalQuestions.yearlyBackgroundsExpected || "-"}</div>
                      <div><strong>Promo Code:</strong> {selectedCompanyModalProfile.additionalQuestions.promoCode || "-"}</div>
                      <div><strong>Primary Industry:</strong> {selectedCompanyModalProfile.additionalQuestions.primaryIndustry || "-"}</div>
                    </div>
                  </article>
                </div>
              )}
            </div>

            <div
              style={{
                padding: "0.85rem 1rem",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button type="button" className="btn btn-secondary" onClick={closeCompanyProfileModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminPortalFrame>
  );
}
