"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Package,
  Plus,
  UserPlus,
  Building,
  Save,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Tag,
  Settings2,
  ListFilter,
  Cog,
  KeyRound,
  ShieldCheck,
  BellRing,
  Sparkles,
  X,
  Archive,
} from "lucide-react";
import AdminManagement from "../../components/AdminManagement";
import VerifierManagement from "../../components/VerifierManagement";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "superadmin" | "verifier";
};

type RequestItem = {
  _id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  status: "pending" | "approved" | "rejected";
  rejectionNote: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
};

type ServiceItem = {
  id: string;
  name: string;
  description: string;
  defaultPrice: number | null;
  defaultCurrency: "INR" | "USD";
};

type CompanyServiceSelection = {
  serviceId: string;
  serviceName: string;
  price: number;
  currency: "INR" | "USD";
};

type CompanyItem = {
  id: string;
  name: string;
  email: string;
  selectedServices: CompanyServiceSelection[];
};

export default function AdminDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<AdminUser | null>(null);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [expandedRequestIds, setExpandedRequestIds] = useState<Record<string, boolean>>({});
  const [collapsedRequestSections, setCollapsedRequestSections] = useState<Record<"pending" | "approved" | "rejected" | "archived", boolean>>({
    pending: false,
    approved: false,
    rejected: false,
    archived: false,
  });

  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPassword, setCompanyPassword] = useState("");
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [selectedCompanyServices, setSelectedCompanyServices] = useState<CompanyServiceSelection[]>([]);
  const [manageCompanyId, setManageCompanyId] = useState("");
  const [manageCompanyServices, setManageCompanyServices] = useState<CompanyServiceSelection[]>([]);
  const [issueServiceSearch, setIssueServiceSearch] = useState("");
  const [manageServiceSearch, setManageServiceSearch] = useState("");
  const [issueServicesCollapsed, setIssueServicesCollapsed] = useState(true);
  const [manageServicesCollapsed, setManageServicesCollapsed] = useState(true);
  const [catalogServicesCollapsed, setCatalogServicesCollapsed] = useState(true);

  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [newServiceDefaultPrice, setNewServiceDefaultPrice] = useState("");
  const [newServiceDefaultCurrency, setNewServiceDefaultCurrency] = useState<"INR" | "USD">("INR");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [archivedSearchText, setArchivedSearchText] = useState("");

  async function loadData() {
    const meRes = await fetch("/api/auth/me", { cache: "no-store" });
    if (!meRes.ok) {
      router.push("/");
      return;
    }

    const meJson = (await meRes.json()) as { user: AdminUser };
    setMe(meJson.user);

    const reqRes = await fetch("/api/requests", { cache: "no-store" });
    if (reqRes.ok) {
      const reqJson = (await reqRes.json()) as { items: RequestItem[] };
      setRequests(reqJson.items);
    }

    if (meJson.user.role === "admin" || meJson.user.role === "superadmin") {
      const serviceRes = await fetch("/api/services", { cache: "no-store" });
      if (serviceRes.ok) {
        const serviceJson = (await serviceRes.json()) as { items: ServiceItem[] };
        setServices(serviceJson.items);
      }

      const companyRes = await fetch("/api/customers", { cache: "no-store" });
      if (companyRes.ok) {
        const companyJson = (await companyRes.json()) as { items: CompanyItem[] };
        setCompanies(companyJson.items);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!manageCompanyId) {
      return;
    }

    const found = companies.find((item) => item.id === manageCompanyId);
    if (found) {
      setManageCompanyServices(found.selectedServices ?? []);
    }
  }, [companies, manageCompanyId]);

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
  }

  async function createService(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    const payload: {
      name: string;
      description: string;
      defaultCurrency: "INR" | "USD";
      defaultPrice?: number;
    } = {
      name: newServiceName,
      description: newServiceDescription,
      defaultCurrency: newServiceDefaultCurrency,
    };

    const trimmedPrice = newServiceDefaultPrice.trim();
    if (trimmedPrice) {
      const parsed = Number(trimmedPrice);
      if (Number.isNaN(parsed) || parsed < 0) {
        setMessage("Please enter a valid default price.");
        return;
      }
      payload.defaultPrice = parsed;
    }

    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Could not create service.");
      return;
    }

    setNewServiceName("");
    setNewServiceDescription("");
    setNewServiceDefaultPrice("");
    setNewServiceDefaultCurrency("INR");
    setMessage(data.message ?? "Service added.");
    await loadData();
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

  function updateCompanyServiceCurrency(serviceId: string, currency: "INR" | "USD") {
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

  function updateManageCompanyServiceCurrency(serviceId: string, currency: "INR" | "USD") {
    setManageCompanyServices((prev) =>
      prev.map((item) => (item.serviceId === serviceId ? { ...item, currency } : item)),
    );
  }

  function pickCompanyForServiceUpdate(companyId: string) {
    setManageCompanyId(companyId);
    const found = companies.find((item) => item.id === companyId);
    setManageCompanyServices(found?.selectedServices ?? []);
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

  async function updateStatus(
    requestId: string,
    status: "approved" | "rejected",
    rejectionNote?: string,
  ) {
    setMessage("");

    const res = await fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, status, rejectionNote }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Could not update status.");
      return;
    }

    setMessage(data.message ?? "Request status updated.");
    await loadData();
  }

  async function rejectWithNote(requestId: string) {
    const note = window.prompt("Rejection note (for customer):", "Invalid request details");
    if (note === null) {
      return;
    }

    const trimmed = note.trim();
    if (!trimmed) {
      setMessage("Please enter a rejection note.");
      return;
    }

    const isConfirmed = window.confirm("Confirm reject this request?");
    if (!isConfirmed) {
      return;
    }

    await updateStatus(requestId, "rejected", trimmed);
  }

  async function approveRequest(requestId: string) {
    const isConfirmed = window.confirm("Confirm approve this request?");
    if (!isConfirmed) {
      return;
    }

    await updateStatus(requestId, "approved");
  }

  const normalizedSearch = searchText.trim().toLowerCase();
  const normalizedArchivedSearch = archivedSearchText.trim().toLowerCase();
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

  const filteredRequests = requests.filter((item) => {
    if (!normalizedSearch) {
      return true;
    }

    const searchable = [
      item.customerName,
      item.customerEmail,
      item.candidateName,
      item.candidateEmail,
      item.candidatePhone,
      item.status,
      item.rejectionNote,
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedSearch);
  });

  const archiveThresholdMs = 14 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();

  function isArchivedRequest(item: RequestItem) {
    const createdAtMs = new Date(item.createdAt).getTime();
    if (Number.isNaN(createdAtMs)) {
      return false;
    }

    return nowMs - createdAtMs >= archiveThresholdMs;
  }

  const activeRequests = filteredRequests.filter((item) => !isArchivedRequest(item));
  const archivedPool = requests.filter((item) => isArchivedRequest(item));

  const archivedRequests = archivedPool.filter((item) => {
    if (!normalizedArchivedSearch) {
      return true;
    }

    const searchable = [
      item.customerName,
      item.customerEmail,
      item.candidateName,
      item.candidateEmail,
      item.candidatePhone,
      item.status,
      item.rejectionNote,
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedArchivedSearch);
  });

  const pendingRequests = activeRequests.filter((item) => item.status === "pending");
  const approvedRequests = activeRequests.filter((item) => item.status === "approved");
  const rejectedRequests = activeRequests.filter((item) => item.status === "rejected");

  function toggleRequestExpand(requestId: string) {
    setExpandedRequestIds((prev) => ({
      ...prev,
      [requestId]: !prev[requestId],
    }));
  }

  function toggleRequestSection(statusType: "pending" | "approved" | "rejected" | "archived") {
    setCollapsedRequestSections((prev) => ({
      ...prev,
      [statusType]: !prev[statusType],
    }));
  }

  function renderRequestSection(
    title: string,
    items: RequestItem[],
    emptyMessage: string,
    statusType: "pending" | "approved" | "rejected",
  ) {
    const isCollapsed = collapsedRequestSections[statusType];

    const StatusIcon =
      statusType === "pending" ? Clock : statusType === "approved" ? CheckCircle : XCircle;

    const IconColor =
      statusType === "pending"
        ? "#eab308" // yellow-500
        : statusType === "approved"
        ? "#22c55e" // green-500
        : "#ef4444"; // red-500

    return (
      <section className="glass-card" style={{ padding: "1.2rem", marginTop: "1.2rem" }}>
        <button
          type="button"
          onClick={() => toggleRequestSection(statusType)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.7rem",
            background: "transparent",
            border: 0,
            cursor: "pointer",
            padding: 0,
            color: "inherit",
            textAlign: "left",
            marginBottom: isCollapsed ? 0 : "0.35rem",
          }}
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${title}`}
        >
          <h3 style={{ marginTop: 0, marginBottom: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <StatusIcon size={20} color={IconColor} />
            {title} ({items.length})
          </h3>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </span>
        </button>
        {!isCollapsed && items.length === 0 && <p style={{ margin: 0 }}>{emptyMessage}</p>}
        {!isCollapsed && items.length > 0 && (
          <div className="request-accordion-list">
            {items.map((item) => {
              const expanded = Boolean(expandedRequestIds[item._id]);
              return (
                <article key={item._id} className="request-accordion-item">
                  <button
                    type="button"
                    className="request-accordion-toggle"
                    onClick={() => toggleRequestExpand(item._id)}
                  >
                    <div className="request-accordion-main">
                      <div className="request-accordion-candidate">{item.candidateName}</div>
                      <div className="request-accordion-status" style={{ textTransform: "capitalize", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <StatusIcon size={16} color={IconColor} />
                        {item.status}
                      </div>
                    </div>
                    <span className="request-accordion-arrow">
                      {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </span>
                  </button>

                  {expanded && (
                    <div className="request-accordion-details">
                      <div className="request-card-label">Company</div>
                      <div className="request-card-value">{item.customerName}</div>

                      <div className="request-card-label">Company Email</div>
                      <div className="request-card-value">{item.customerEmail}</div>

                      <div className="request-card-label">Candidate Email</div>
                      <div className="request-card-value">{item.candidateEmail}</div>

                      <div className="request-card-label">Phone</div>
                      <div className="request-card-value">{item.candidatePhone || "-"}</div>

                      <div className="request-card-label">Admin Note</div>
                      <div className="request-card-value">{item.rejectionNote || "-"}</div>

                      <div className="request-card-label">Created</div>
                      <div className="request-card-value">{new Date(item.createdAt).toLocaleString()}</div>

                      {statusType === "pending" && (
                        <div className="request-card-actions" style={{ marginTop: "0.35rem", display: "flex", gap: "0.5rem" }}>
                          <button className="btn btn-secondary" style={{ borderColor: "#22c55e", color: "#22c55e" }} onClick={() => approveRequest(item._id)}>
                            <CheckCircle size={16} style={{ marginRight: "0.4rem" }} />
                            Approve
                          </button>
                          <button className="btn btn-secondary" style={{ borderColor: "#ef4444", color: "#ef4444" }} onClick={() => rejectWithNote(item._id)}>
                            <XCircle size={16} style={{ marginRight: "0.4rem" }} />
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  function renderArchivedSection(items: RequestItem[]) {
    const isCollapsed = collapsedRequestSections.archived;

    return (
      <section className="glass-card" style={{ padding: "1.2rem", marginTop: "1.2rem" }}>
        <button
          type="button"
          onClick={() => toggleRequestSection("archived")}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.7rem",
            background: "transparent",
            border: 0,
            cursor: "pointer",
            padding: 0,
            color: "inherit",
            textAlign: "left",
            marginBottom: isCollapsed ? 0 : "0.35rem",
          }}
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} Archived Requests`}
        >
          <h3 style={{ marginTop: 0, marginBottom: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Archive size={20} color="#6366f1" />
            Archived Requests ({items.length})
          </h3>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </span>
        </button>

        {!isCollapsed && <p style={{ color: "#5a748f", marginTop: 0 }}>
          Requests older than 14 days are automatically moved here.
        </p>}

        {!isCollapsed && <div className="search-input-wrap" style={{ marginBottom: "0.8rem" }}>
          <span className="search-input-icon" aria-hidden="true" style={{ marginTop: "0.1rem" }}>
            <Search size={18} />
          </span>
          <input
            className="input"
            placeholder="Search archived requests by company, candidate, email, phone, status or note"
            value={archivedSearchText}
            onChange={(e) => setArchivedSearchText(e.target.value)}
          />
        </div>}

        {!isCollapsed && items.length === 0 && <p style={{ margin: 0 }}>No archived requests found.</p>}

        {!isCollapsed && items.length > 0 && (
          <div className="request-accordion-list">
            {items.map((item) => {
              const expanded = Boolean(expandedRequestIds[item._id]);
              return (
                <article key={`archived-${item._id}`} className="request-accordion-item">
                  <button
                    type="button"
                    className="request-accordion-toggle"
                    onClick={() => toggleRequestExpand(item._id)}
                  >
                    <div className="request-accordion-main">
                      <div className="request-accordion-candidate">{item.candidateName}</div>
                      <div className={`status-pill status-pill-${item.status}`} style={{ textTransform: "capitalize" }}>
                        {item.status}
                      </div>
                    </div>
                    <span className="request-accordion-arrow">
                      {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </span>
                  </button>

                  {expanded && (
                    <div className="request-accordion-details">
                      <div className="request-card-label">Company</div>
                      <div className="request-card-value">{item.customerName}</div>

                      <div className="request-card-label">Company Email</div>
                      <div className="request-card-value">{item.customerEmail}</div>

                      <div className="request-card-label">Candidate Email</div>
                      <div className="request-card-value">{item.candidateEmail}</div>

                      <div className="request-card-label">Phone</div>
                      <div className="request-card-value">{item.candidatePhone || "-"}</div>

                      <div className="request-card-label">Admin Note</div>
                      <div className="request-card-value">{item.rejectionNote || "-"}</div>

                      <div className="request-card-label">Created</div>
                      <div className="request-card-value">{new Date(item.createdAt).toLocaleString()}</div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordMessage("");

    if (newPassword !== confirmPassword) {
      setPasswordMessage("New password and confirm password must match.");
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
      setPasswordMessage(data.error ?? "Could not change password.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage(data.message ?? "Password changed successfully.");
  }

  if (loading) {
    return <main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>;
  }

  return (
    <main className="shell" style={{ padding: "2rem 0 4rem" }}>
      <section className="glass-card portal-banner" style={{ padding: "1rem 1.2rem", marginBottom: "1rem" }}>
        <div className="portal-banner-content">
          <span className="portal-banner-icon" aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <div>
            <strong>Admin Control Banner</strong>
            <div style={{ color: "#527190", fontSize: "0.9rem" }}>
              Manage services, company access, and request decisions from one control center.
            </div>
          </div>
        </div>
        <div className="portal-banner-tag">
          <BellRing size={14} />
          Live workflow controls
        </div>
      </section>

      <section
        className="glass-card"
        style={{ padding: "1rem 1.2rem", marginBottom: "1.3rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.8rem", flexWrap: "wrap", position: "relative", zIndex: 30 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
          <Settings2 size={24} color="#4A90E2" />
          <div>
            <strong>{me?.name}</strong>
            <div style={{ color: "#5a748f", fontSize: "0.9rem" }}>
              {me?.email} <span style={{ textTransform: 'capitalize', fontWeight: 600, color: me?.role === 'superadmin' ? '#eab308' : '#36516e' }}>({me?.role})</span>
            </div>
          </div>
        </div>
        <div className="account-actions-wrap">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSettingsOpen((prev) => !prev)}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
            aria-expanded={settingsOpen}
            aria-label="Open account settings"
          >
            <Cog size={16} />
            Settings
          </button>
          <button className="btn btn-secondary" onClick={logout} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <LogOut size={16} />
            Logout
          </button>

          {settingsOpen && (
            <div className="settings-popover glass-card">
              <div className="settings-popover-head">
                <strong style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <ShieldCheck size={16} />
                  Account Security
                </strong>
                <button
                  type="button"
                  className="settings-close-btn"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="Close settings"
                >
                  <X size={14} />
                </button>
              </div>
              <form onSubmit={changePassword} style={{ display: "grid", gap: "0.6rem" }}>
                <label className="label" style={{ marginBottom: 0 }}>
                  Current Password
                </label>
                <input
                  className="input"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />

                <label className="label" style={{ marginBottom: 0 }}>
                  New Password
                </label>
                <input
                  className="input"
                  type="password"
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />

                <label className="label" style={{ marginBottom: 0 }}>
                  Confirm New Password
                </label>
                <input
                  className="input"
                  type="password"
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />

                {passwordMessage && (
                  <p style={{ margin: 0, color: passwordMessage.toLowerCase().includes("success") ? "#0f7b3d" : "#b02525", fontSize: "0.88rem", fontWeight: 600 }}>
                    {passwordMessage}
                  </p>
                )}

                <button className="btn btn-primary" disabled={changingPassword} style={{ display: "inline-flex", justifyContent: "center", alignItems: "center", gap: "0.45rem" }}>
                  <KeyRound size={15} />
                  {changingPassword ? "Updating..." : "Change Password"}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      {me?.role === "superadmin" && <AdminManagement />}
      {(me?.role === "admin" || me?.role === "superadmin") && <VerifierManagement />}

      {message && (
        <p style={{ marginTop: 0, color: "#114c8f", fontWeight: 600 }}>{message}</p>
      )}

      {(me?.role === "admin" || me?.role === "superadmin") && (
      <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Package size={24} color="#4A90E2" />
          Service Catalog
        </h2>
        <p style={{ color: "#5a748f" }}>
          Add reusable services first. Later, choose services and set custom price per company account.
        </p>

        <form
          onSubmit={createService}
          style={{
            display: "grid",
            gap: "0.8rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            marginBottom: "1rem",
          }}
        >
          <div>
            <label className="label">Service Name</label>
            <input
              className="input"
              value={newServiceName}
              onChange={(e) => setNewServiceName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Description</label>
            <input
              className="input"
              value={newServiceDescription}
              onChange={(e) => setNewServiceDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Default Price (Optional)</label>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={newServiceDefaultPrice}
              onChange={(e) => setNewServiceDefaultPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Default Currency</label>
            <select
              className="input"
              value={newServiceDefaultCurrency}
              onChange={(e) => setNewServiceDefaultCurrency(e.target.value as "INR" | "USD")}
            >
              <option value="INR">INR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button className="btn btn-primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
              <Plus size={18} />
              Add Service
            </button>
          </div>
        </form>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>All Services ({services.length})</h3>
          {services.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCatalogServicesCollapsed((prev) => !prev)}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              {catalogServicesCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              {catalogServicesCollapsed ? "Expand List" : "Collapse List"}
            </button>
          )}
        </div>

        {!catalogServicesCollapsed && (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {services.length === 0 && <p style={{ margin: 0 }}>No services added yet.</p>}
            {services.map((service) => (
              <div
                key={service.id}
              style={{
                border: "1px solid #d4e2f2",
                borderRadius: "0.65rem",
                padding: "0.65rem 0.8rem",
                background: "#f8fbff",
                display: "flex",
                gap: "0.8rem",
                alignItems: "flex-start"
              }}
            >
              <div style={{ marginTop: "0.15rem" }}>
                <Tag size={18} color="#4A90E2" />
              </div>
              <div>
                <strong>{service.name}</strong>
                <div style={{ color: "#5a748f", fontSize: "0.9rem" }}>
                  {service.description || "No description"}
                </div>
                <div style={{ color: "#36516e", fontSize: "0.88rem", marginTop: "0.2rem" }}>
                  Default: {service.defaultPrice !== null ? `${service.defaultCurrency} ${service.defaultPrice}` : "Not set"}
                </div>
              </div>
            </div>
          ))}
          </div>
        )}
      </section>
      )}

      {(me?.role === "admin" || me?.role === "superadmin") && (
      <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <UserPlus size={24} color="#4A90E2" />
          Issue Company Login ID
        </h2>
        <p style={{ color: "#5a748f" }}>
          Create a customer company account. Select services and set custom price for this company.
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
            <input
              className="input"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Company Login Email</label>
            <input
              className="input"
              type="email"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={companyPassword}
              onChange={(e) => setCompanyPassword(e.target.value)}
              required
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="label">Assign Services With Company-Specific Price</label>
            {services.length === 0 ? (
              <div style={{ color: "#5a748f" }}>Add services in Service Catalog before creating company accounts.</div>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "minmax(240px, 1fr) auto",
                    alignItems: "end",
                  }}
                >
                  <div>
                    <label className="label">Search Services</label>
                    <input
                      className="input"
                      placeholder="Search by service name"
                      value={issueServiceSearch}
                      onChange={(e) => setIssueServiceSearch(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIssueServicesCollapsed((prev) => !prev)}
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    {issueServicesCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    {issueServicesCollapsed ? "Expand Services" : "Collapse Services"}
                  </button>
                </div>

                {!issueServicesCollapsed && filteredIssueServices.length === 0 && (
                  <div style={{ color: "#5a748f" }}>No services match your search.</div>
                )}

                {!issueServicesCollapsed && filteredIssueServices.map((service) => {
                  const selected = selectedCompanyServices.find((item) => item.serviceId === service.id);
                  return (
                    <div
                      key={service.id}
                      style={{
                        border: "1px solid #d4e2f2",
                        borderRadius: "0.65rem",
                        padding: "0.75rem",
                        background: "#f8fbff",
                      }}
                    >
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(selected)}
                          onChange={(e) => toggleCompanyService(service, e.target.checked)}
                        />
                        {service.name}
                      </label>
                      <div style={{ color: "#5a748f", marginTop: "0.25rem" }}>
                        {service.description || "No description"}
                      </div>

                      {selected && (
                        <div
                          style={{
                            marginTop: "0.6rem",
                            display: "grid",
                            gap: "0.6rem",
                            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                          }}
                        >
                          <div>
                            <label className="label">Price</label>
                            <input
                              className="input"
                              type="number"
                              min={0}
                              step="0.01"
                              value={selected.price}
                              onChange={(e) => updateCompanyServicePrice(service.id, e.target.value)}
                              required
                            />
                          </div>
                          <div>
                            <label className="label">Currency</label>
                            <select
                              className="input"
                              value={selected.currency}
                              onChange={(e) =>
                                updateCompanyServiceCurrency(service.id, e.target.value as "INR" | "USD")
                              }
                            >
                              <option value="INR">INR</option>
                              <option value="USD">USD</option>
                            </select>
                          </div>
                        </div>
                      )}
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
      )}

      {(me?.role === "admin" || me?.role === "superadmin") && (
      <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Building size={24} color="#4A90E2" />
          Update Existing Company Services
        </h2>
        <p style={{ color: "#5a748f" }}>
          Use this for companies already created earlier (for example if customer portal shows no assigned services).
        </p>
        <form onSubmit={updateCompanyServices} style={{ display: "grid", gap: "0.8rem" }}>
          <div>
            <label className="label">Select Company</label>
            <select
              className="input"
              value={manageCompanyId}
              onChange={(e) => pickCompanyForServiceUpdate(e.target.value)}
              required
            >
              <option value="">Choose company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name} ({company.email})
                </option>
              ))}
            </select>
          </div>

          {manageCompanyId && services.length > 0 && (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <div
                style={{
                  display: "grid",
                  gap: "0.75rem",
                  gridTemplateColumns: "minmax(240px, 1fr) auto",
                  alignItems: "end",
                }}
              >
                <div>
                  <label className="label">Search Services</label>
                  <input
                    className="input"
                    placeholder="Search by service name"
                    value={manageServiceSearch}
                    onChange={(e) => setManageServiceSearch(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setManageServicesCollapsed((prev) => !prev)}
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                >
                  {manageServicesCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  {manageServicesCollapsed ? "Expand Services" : "Collapse Services"}
                </button>
              </div>

              {!manageServicesCollapsed && filteredManageServices.length === 0 && (
                <div style={{ color: "#5a748f" }}>No services match your search.</div>
              )}

              {!manageServicesCollapsed && filteredManageServices.map((service) => {
                const selected = manageCompanyServices.find((item) => item.serviceId === service.id);
                return (
                  <div
                    key={`manage-${service.id}`}
                    style={{
                      border: "1px solid #d4e2f2",
                      borderRadius: "0.65rem",
                      padding: "0.75rem",
                      background: "#f8fbff",
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(selected)}
                        onChange={(e) => toggleManageCompanyService(service, e.target.checked)}
                      />
                      {service.name}
                    </label>

                    {selected && (
                      <div
                        style={{
                          marginTop: "0.6rem",
                          display: "grid",
                          gap: "0.6rem",
                          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                        }}
                      >
                        <div>
                          <label className="label">Price</label>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            step="0.01"
                            value={selected.price}
                            onChange={(e) => updateManageCompanyServicePrice(service.id, e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label className="label">Currency</label>
                          <select
                            className="input"
                            value={selected.currency}
                            onChange={(e) =>
                              updateManageCompanyServiceCurrency(service.id, e.target.value as "INR" | "USD")
                            }
                          >
                            <option value="INR">INR</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <button className="btn btn-primary" type="submit" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Save size={18} />
              Save Company Services
            </button>
          </div>
        </form>
      </section>
      )}

      <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ListFilter size={24} color="#4A90E2" />
          Verification Requests
        </h2>
        <p style={{ color: "#5a748f", marginTop: 0 }}>
          Search and manage requests across Pending, Approved, and Rejected sections. Requests older than 14 days are moved to Archived.
        </p>
        <div className="search-input-wrap">
          <span className="search-input-icon" aria-hidden="true" style={{ marginTop: "0.1rem" }}>
            <Search size={18} />
          </span>
          <input
            className="input"
            placeholder="Search by company, candidate, email, phone, status or note"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </section>

      {renderRequestSection(
        "Pending Requests",
        pendingRequests,
        "No pending requests found.",
        "pending",
      )}
      {renderRequestSection(
        "Approved Requests",
        approvedRequests,
        "No approved requests found.",
        "approved",
      )}
      {renderRequestSection(
        "Rejected Requests",
        rejectedRequests,
        "No rejected requests found.",
        "rejected",
      )}
      {renderArchivedSection(archivedRequests)}
    </main>
  );
}
