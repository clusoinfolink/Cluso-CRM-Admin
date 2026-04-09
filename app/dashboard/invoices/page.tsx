"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  FileText,
  Save,
  Send,
  UserCircle2,
} from "lucide-react";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { getAlertTone } from "@/lib/alerts";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import type {
  CompanyItem,
  InvoicePartyDetails,
  InvoiceRecord,
  InvoiceWorkspaceResponse,
} from "@/lib/types";

function createEmptyPartyDetails(): InvoicePartyDetails {
  return {
    companyName: "",
    loginEmail: "",
    gstin: "",
    cinRegistrationNumber: "",
    address: "",
    invoiceEmail: "",
    billingSameAsCompany: true,
    billingAddress: "",
  };
}

function toAddressString(address: {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}) {
  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ]
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parts.join(", ");
}

function buildEnterpriseDraft(company: CompanyItem): InvoicePartyDetails {
  const profile = company.partnerProfile;
  const companyAddress = toAddressString(profile.companyInformation.address);
  const billingSameAsCompany = profile.invoicingInformation.billingSameAsCompany;
  const billingAddress = billingSameAsCompany
    ? companyAddress
    : toAddressString(profile.invoicingInformation.address);

  return {
    companyName: profile.companyInformation.companyName.trim() || company.name,
    loginEmail: company.email,
    gstin: profile.companyInformation.gstin,
    cinRegistrationNumber: profile.companyInformation.cinRegistrationNumber,
    address: companyAddress,
    invoiceEmail: profile.invoicingInformation.invoiceEmail.trim() || company.email,
    billingSameAsCompany,
    billingAddress,
  };
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function updatePartyDraft(
  previous: InvoicePartyDetails,
  field: keyof InvoicePartyDetails,
  value: string | boolean,
): InvoicePartyDetails {
  const next = {
    ...previous,
    [field]: value,
  } as InvoicePartyDetails;

  if (field === "address" && next.billingSameAsCompany) {
    next.billingAddress = String(value);
  }

  if (field === "billingSameAsCompany") {
    const checked = Boolean(value);
    next.billingSameAsCompany = checked;
    if (checked) {
      next.billingAddress = next.address;
    }
  }

  return next;
}

export default function InvoicesPage() {
  const { me, loading, logout } = useAdminSession();
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [clusoDefaultDetails, setClusoDefaultDetails] =
    useState<InvoicePartyDetails>(createEmptyPartyDetails);

  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [enterpriseDraft, setEnterpriseDraft] =
    useState<InvoicePartyDetails>(createEmptyPartyDetails);
  const [clusoDraft, setClusoDraft] = useState<InvoicePartyDetails>(
    createEmptyPartyDetails,
  );

  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [message, setMessage] = useState("");
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [savingFields, setSavingFields] = useState(false);
  const [sendingInvoiceId, setSendingInvoiceId] = useState("");

  const canAccess = me?.role === "admin" || me?.role === "superadmin";

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  const companyInvoices = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.customerId === selectedCompanyId)
        .sort(
          (first, second) =>
            new Date(second.createdAt).getTime() -
            new Date(first.createdAt).getTime(),
        ),
    [invoices, selectedCompanyId],
  );

  const selectedInvoice = useMemo(
    () => companyInvoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [companyInvoices, selectedInvoiceId],
  );

  const latestServiceTotals = useMemo(() => {
    if (!selectedCompany) {
      return [] as Array<{ currency: string; subtotal: number }>;
    }

    const totals = new Map<string, number>();
    for (const service of selectedCompany.selectedServices ?? []) {
      totals.set(service.currency, (totals.get(service.currency) ?? 0) + service.price);
    }

    return [...totals.entries()]
      .map(([currency, subtotal]) => ({ currency, subtotal }))
      .sort((first, second) => first.currency.localeCompare(second.currency));
  }, [selectedCompany]);

  const applyDraftDefaults = useCallback(
    (companyId: string, keepCurrentInvoiceSelection = false) => {
      const company = companies.find((entry) => entry.id === companyId);
      if (!company) {
        setEnterpriseDraft(createEmptyPartyDetails());
        setClusoDraft(clusoDefaultDetails);
        if (!keepCurrentInvoiceSelection) {
          setSelectedInvoiceId("");
        }
        return;
      }

      const invoiceForCompany = invoices.find(
        (invoice) => invoice.id === selectedInvoiceId && invoice.customerId === companyId,
      );

      if (invoiceForCompany) {
        setEnterpriseDraft(invoiceForCompany.enterpriseDetails);
        setClusoDraft(invoiceForCompany.clusoDetails);
        return;
      }

      setEnterpriseDraft(buildEnterpriseDraft(company));
      setClusoDraft(clusoDefaultDetails);
      if (!keepCurrentInvoiceSelection) {
        setSelectedInvoiceId("");
      }
    },
    [companies, invoices, selectedInvoiceId, clusoDefaultDetails],
  );

  const loadWorkspace = useCallback(
    async (preferredCompanyId?: string, preferredInvoiceId?: string) => {
      if (!canAccess) {
        return;
      }

      setLoadingWorkspace(true);
      try {
        const [companiesRes, invoicesRes] = await Promise.all([
          fetch("/api/customers", { cache: "no-store" }),
          fetch("/api/invoices", { cache: "no-store" }),
        ]);

        const companiesPayload =
          (await companiesRes.json()) as
            | { items?: CompanyItem[]; error?: string }
            | undefined;
        const invoicesPayload =
          (await invoicesRes.json()) as
            | (InvoiceWorkspaceResponse & { error?: string })
            | undefined;

        if (!companiesRes.ok) {
          setMessage(companiesPayload?.error ?? "Could not load companies for invoices.");
          return;
        }

        if (!invoicesRes.ok) {
          setMessage(invoicesPayload?.error ?? "Could not load invoices.");
          return;
        }

        const nextCompanies = companiesPayload?.items ?? [];
        const nextInvoices = invoicesPayload?.invoices ?? [];
        const nextClusoDefaults =
          invoicesPayload?.clusoDefaultDetails ?? createEmptyPartyDetails();

        setCompanies(nextCompanies);
        setInvoices(nextInvoices);
        setClusoDefaultDetails(nextClusoDefaults);

        const targetCompanyId =
          preferredCompanyId &&
          nextCompanies.some((company) => company.id === preferredCompanyId)
            ? preferredCompanyId
            : selectedCompanyId &&
                nextCompanies.some((company) => company.id === selectedCompanyId)
              ? selectedCompanyId
              : nextCompanies[0]?.id ?? "";

        setSelectedCompanyId(targetCompanyId);

        const targetInvoiceId =
          preferredInvoiceId &&
          nextInvoices.some((invoice) => invoice.id === preferredInvoiceId)
            ? preferredInvoiceId
            : selectedInvoiceId &&
                nextInvoices.some((invoice) => invoice.id === selectedInvoiceId)
              ? selectedInvoiceId
              : "";

        setSelectedInvoiceId(targetInvoiceId);

        const targetCompany = nextCompanies.find((company) => company.id === targetCompanyId);
        const targetInvoice = nextInvoices.find((invoice) => invoice.id === targetInvoiceId);

        if (targetInvoice && targetInvoice.customerId === targetCompanyId) {
          setEnterpriseDraft(targetInvoice.enterpriseDetails);
          setClusoDraft(targetInvoice.clusoDetails);
        } else if (targetCompany) {
          setEnterpriseDraft(buildEnterpriseDraft(targetCompany));
          setClusoDraft(nextClusoDefaults);
        } else {
          setEnterpriseDraft(createEmptyPartyDetails());
          setClusoDraft(nextClusoDefaults);
        }
      } catch {
        setMessage("Could not load invoice workspace.");
      } finally {
        setLoadingWorkspace(false);
      }
    },
    [canAccess, selectedCompanyId, selectedInvoiceId],
  );

  useEffect(() => {
    if (!me || !canAccess) {
      return;
    }

    void loadWorkspace();
  }, [me, canAccess, loadWorkspace]);

  useEffect(() => {
    if (!selectedCompanyId || companies.length === 0) {
      return;
    }

    if (!selectedInvoiceId) {
      const company = companies.find((entry) => entry.id === selectedCompanyId);
      if (company) {
        setEnterpriseDraft(buildEnterpriseDraft(company));
        setClusoDraft(clusoDefaultDetails);
      }
      return;
    }

    const invoice = invoices.find((entry) => entry.id === selectedInvoiceId);
    if (invoice && invoice.customerId === selectedCompanyId) {
      setEnterpriseDraft(invoice.enterpriseDetails);
      setClusoDraft(invoice.clusoDetails);
      return;
    }

    const company = companies.find((entry) => entry.id === selectedCompanyId);
    if (company) {
      setEnterpriseDraft(buildEnterpriseDraft(company));
      setClusoDraft(clusoDefaultDetails);
    }
  }, [
    selectedCompanyId,
    selectedInvoiceId,
    companies,
    invoices,
    clusoDefaultDetails,
  ]);

  async function generateInvoice() {
    if (!selectedCompanyId) {
      setMessage("Please choose a company first.");
      return;
    }

    setGeneratingInvoice(true);
    setMessage("");

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          companyId: selectedCompanyId,
          enterpriseDetails: enterpriseDraft,
          clusoDetails: clusoDraft,
        }),
      });

      const data = (await res.json()) as {
        message?: string;
        error?: string;
        invoice?: InvoiceRecord;
      };

      if (!res.ok) {
        setMessage(data.error ?? "Could not generate invoice.");
        return;
      }

      const createdInvoiceId = data.invoice?.id ?? "";
      setMessage(data.message ?? "Invoice generated successfully.");
      await loadWorkspace(selectedCompanyId, createdInvoiceId);
    } catch {
      setMessage("Could not generate invoice.");
    } finally {
      setGeneratingInvoice(false);
    }
  }

  async function saveInvoiceFieldEdits() {
    if (!selectedInvoiceId) {
      setMessage("Select a generated invoice to save field edits.");
      return;
    }

    setSavingFields(true);
    setMessage("");

    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-fields",
          invoiceId: selectedInvoiceId,
          enterpriseDetails: enterpriseDraft,
          clusoDetails: clusoDraft,
        }),
      });

      const data = (await res.json()) as {
        message?: string;
        error?: string;
        invoice?: InvoiceRecord;
      };

      if (!res.ok) {
        setMessage(data.error ?? "Could not save invoice field changes.");
        return;
      }

      setMessage(data.message ?? "Invoice fields updated successfully.");
      await loadWorkspace(selectedCompanyId, data.invoice?.id ?? selectedInvoiceId);
    } catch {
      setMessage("Could not save invoice field changes.");
    } finally {
      setSavingFields(false);
    }
  }

  function downloadInvoicePdf(invoiceId: string) {
    const link = document.createElement("a");
    link.href = `/api/invoices/${encodeURIComponent(invoiceId)}/pdf`;
    link.target = "_blank";
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function sendInvoiceToCustomer(invoiceId: string) {
    if (!invoiceId) {
      return;
    }

    setSendingInvoiceId(invoiceId);
    setMessage("");

    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/send`, {
        method: "POST",
      });

      const data = (await response.json()) as {
        message?: string;
        error?: string;
        details?: string;
      };

      if (!response.ok) {
        setMessage(
          data.details
            ? `${data.error ?? "Could not send invoice to customer."} ${data.details}`
            : data.error ?? "Could not send invoice to customer.",
        );
        return;
      }

      setMessage(data.message ?? "Invoice emailed to customer successfully.");
    } catch {
      setMessage("Could not send invoice to customer.");
    } finally {
      setSendingInvoiceId("");
    }
  }

  if (loading || !me || loadingWorkspace) {
    return <main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>;
  }

  if (!canAccess) {
    return (
      <AdminPortalFrame
        me={me}
        onLogout={logout}
        title="Invoices"
        subtitle="Admin permissions required."
      >
        <section className="glass-card" style={{ padding: "1.2rem" }}>
          <p className="inline-alert inline-alert-warning" style={{ margin: 0 }}>
            You do not have permission to access invoices.
          </p>
        </section>
      </AdminPortalFrame>
    );
  }

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Invoices"
      subtitle="Generate and view company invoices using the latest assigned service rates."
    >
      {message ? <p className={`inline-alert ${getAlertTone(message)}`}>{message}</p> : null}

      <section className="glass-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <Building2 size={19} color="#4A90E2" />
          Companies
        </h2>

        {companies.length === 0 ? (
          <p style={{ margin: 0, color: "#64748B" }}>No companies found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #E2E8F0" }}>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Company</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Login Email</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Latest Services</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Invoices</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => {
                  const invoiceCount = invoices.filter(
                    (invoice) => invoice.customerId === company.id,
                  ).length;
                  const isSelected = selectedCompanyId === company.id;

                  return (
                    <tr key={company.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <td style={{ padding: "0.55rem", color: "#1E293B", fontWeight: 600 }}>
                        {company.name}
                      </td>
                      <td style={{ padding: "0.55rem", color: "#334155" }}>{company.email}</td>
                      <td style={{ padding: "0.55rem", color: "#334155" }}>
                        {(company.selectedServices ?? []).length}
                      </td>
                      <td style={{ padding: "0.55rem", color: "#334155" }}>{invoiceCount}</td>
                      <td style={{ padding: "0.55rem" }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setSelectedCompanyId(company.id);
                            setSelectedInvoiceId("");
                            applyDraftDefaults(company.id);
                          }}
                          style={{
                            borderColor: isSelected ? "#93C5FD" : undefined,
                            color: isSelected ? "#1D4ED8" : undefined,
                          }}
                        >
                          {isSelected ? "Selected" : "Open"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        <article className="glass-card" style={{ padding: "1rem", display: "grid", gap: "0.8rem" }}>
          <h3 style={{ margin: 0, color: "#1E293B", display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <UserCircle2 size={18} color="#4A90E2" />
            Customer Details - Enterprise Details
          </h3>

          <div>
            <label className="label" htmlFor="invoice-company-name">Company Name</label>
            <input
              id="invoice-company-name"
              className="input"
              value={enterpriseDraft.companyName}
              onChange={(event) =>
                setEnterpriseDraft((prev) =>
                  updatePartyDraft(prev, "companyName", event.target.value),
                )
              }
            />
          </div>

          <div>
            <label className="label" htmlFor="invoice-login-email">Login Email</label>
            <input
              id="invoice-login-email"
              className="input"
              value={enterpriseDraft.loginEmail}
              onChange={(event) =>
                setEnterpriseDraft((prev) =>
                  updatePartyDraft(prev, "loginEmail", event.target.value),
                )
              }
            />
          </div>

          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <div>
              <label className="label" htmlFor="invoice-gstin">GSTIN</label>
              <input
                id="invoice-gstin"
                className="input"
                value={enterpriseDraft.gstin}
                onChange={(event) =>
                  setEnterpriseDraft((prev) =>
                    updatePartyDraft(prev, "gstin", event.target.value),
                  )
                }
              />
            </div>

            <div>
              <label className="label" htmlFor="invoice-cin">CIN / Registration</label>
              <input
                id="invoice-cin"
                className="input"
                value={enterpriseDraft.cinRegistrationNumber}
                onChange={(event) =>
                  setEnterpriseDraft((prev) =>
                    updatePartyDraft(prev, "cinRegistrationNumber", event.target.value),
                  )
                }
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="invoice-address">Address</label>
            <textarea
              id="invoice-address"
              className="input"
              rows={2}
              value={enterpriseDraft.address}
              onChange={(event) =>
                setEnterpriseDraft((prev) =>
                  updatePartyDraft(prev, "address", event.target.value),
                )
              }
              style={{ resize: "vertical" }}
            />
          </div>

          <div>
            <label className="label" htmlFor="invoice-email">Invoice Email</label>
            <input
              id="invoice-email"
              className="input"
              value={enterpriseDraft.invoiceEmail}
              onChange={(event) =>
                setEnterpriseDraft((prev) =>
                  updatePartyDraft(prev, "invoiceEmail", event.target.value),
                )
              }
            />
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={enterpriseDraft.billingSameAsCompany}
              onChange={(event) =>
                setEnterpriseDraft((prev) =>
                  updatePartyDraft(prev, "billingSameAsCompany", event.target.checked),
                )
              }
            />
            Billing same as company
          </label>

          <div>
            <label className="label" htmlFor="billing-address">Billing Address</label>
            <textarea
              id="billing-address"
              className="input"
              rows={2}
              value={enterpriseDraft.billingAddress}
              onChange={(event) =>
                setEnterpriseDraft((prev) =>
                  updatePartyDraft(prev, "billingAddress", event.target.value),
                )
              }
              disabled={enterpriseDraft.billingSameAsCompany}
              style={{ resize: "vertical" }}
            />
          </div>
        </article>

        <article className="glass-card" style={{ padding: "1rem", display: "grid", gap: "0.8rem" }}>
          <h3 style={{ margin: 0, color: "#1E293B", display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <Building2 size={18} color="#4A90E2" />
            Cluso Infolink Details
          </h3>

          <div>
            <label className="label" htmlFor="cluso-company-name">Company Name</label>
            <input
              id="cluso-company-name"
              className="input"
              value={clusoDraft.companyName}
              onChange={(event) =>
                setClusoDraft((prev) =>
                  updatePartyDraft(prev, "companyName", event.target.value),
                )
              }
            />
          </div>

          <div>
            <label className="label" htmlFor="cluso-login-email">Login Email</label>
            <input
              id="cluso-login-email"
              className="input"
              value={clusoDraft.loginEmail}
              onChange={(event) =>
                setClusoDraft((prev) =>
                  updatePartyDraft(prev, "loginEmail", event.target.value),
                )
              }
            />
          </div>

          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <div>
              <label className="label" htmlFor="cluso-gstin">GSTIN</label>
              <input
                id="cluso-gstin"
                className="input"
                value={clusoDraft.gstin}
                onChange={(event) =>
                  setClusoDraft((prev) =>
                    updatePartyDraft(prev, "gstin", event.target.value),
                  )
                }
              />
            </div>

            <div>
              <label className="label" htmlFor="cluso-cin">CIN / Registration</label>
              <input
                id="cluso-cin"
                className="input"
                value={clusoDraft.cinRegistrationNumber}
                onChange={(event) =>
                  setClusoDraft((prev) =>
                    updatePartyDraft(prev, "cinRegistrationNumber", event.target.value),
                  )
                }
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="cluso-address">Address</label>
            <textarea
              id="cluso-address"
              className="input"
              rows={2}
              value={clusoDraft.address}
              onChange={(event) =>
                setClusoDraft((prev) =>
                  updatePartyDraft(prev, "address", event.target.value),
                )
              }
              style={{ resize: "vertical" }}
            />
          </div>

          <div>
            <label className="label" htmlFor="cluso-invoice-email">Invoice Email</label>
            <input
              id="cluso-invoice-email"
              className="input"
              value={clusoDraft.invoiceEmail}
              onChange={(event) =>
                setClusoDraft((prev) =>
                  updatePartyDraft(prev, "invoiceEmail", event.target.value),
                )
              }
            />
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={clusoDraft.billingSameAsCompany}
              onChange={(event) =>
                setClusoDraft((prev) =>
                  updatePartyDraft(prev, "billingSameAsCompany", event.target.checked),
                )
              }
            />
            Billing same as company
          </label>

          <div>
            <label className="label" htmlFor="cluso-billing-address">Billing Address</label>
            <textarea
              id="cluso-billing-address"
              className="input"
              rows={2}
              value={clusoDraft.billingAddress}
              onChange={(event) =>
                setClusoDraft((prev) =>
                  updatePartyDraft(prev, "billingAddress", event.target.value),
                )
              }
              disabled={clusoDraft.billingSameAsCompany}
              style={{ resize: "vertical" }}
            />
          </div>
        </article>
      </section>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          marginTop: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        <article className="glass-card" style={{ padding: "1rem" }}>
          <h3 style={{ margin: 0, color: "#1E293B", display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <FileText size={18} color="#4A90E2" />
            Latest Service Rates
          </h3>
          {!selectedCompany ? (
            <p style={{ marginBottom: 0, color: "#64748B" }}>Select a company to view rates.</p>
          ) : selectedCompany.selectedServices.length === 0 ? (
            <p style={{ marginBottom: 0, color: "#64748B" }}>
              No active services/rates found for this company.
            </p>
          ) : (
            <>
              <div style={{ overflowX: "auto", marginTop: "0.65rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "520px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #E2E8F0" }}>
                      <th style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#64748B" }}>Service</th>
                      <th style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#64748B" }}>Currency</th>
                      <th style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#64748B" }}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCompany.selectedServices.map((service) => (
                      <tr key={`${selectedCompany.id}-${service.serviceId}`} style={{ borderBottom: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "0.45rem", color: "#334155" }}>{service.serviceName}</td>
                        <td style={{ padding: "0.45rem", color: "#334155" }}>{service.currency}</td>
                        <td style={{ padding: "0.45rem", color: "#1E293B", fontWeight: 600 }}>
                          {formatMoney(service.price, service.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: "0.65rem", display: "grid", gap: "0.3rem" }}>
                {latestServiceTotals.map((total) => (
                  <div key={total.currency} style={{ color: "#334155", fontSize: "0.86rem" }}>
                    <strong>Total ({total.currency}):</strong> {formatMoney(total.subtotal, total.currency)}
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem", marginTop: "0.95rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void generateInvoice()}
              disabled={!selectedCompany || generatingInvoice}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
            >
              <CheckCircle2 size={16} />
              {generatingInvoice ? "Generating..." : "Generate Invoice"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (!selectedCompany) {
                  return;
                }
                setSelectedInvoiceId("");
                setEnterpriseDraft(buildEnterpriseDraft(selectedCompany));
                setClusoDraft(clusoDefaultDetails);
                setMessage("Loaded customer profile defaults and Cluso defaults.");
              }}
            >
              Use Profile Defaults
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void saveInvoiceFieldEdits()}
              disabled={!selectedInvoice || savingFields}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
            >
              <Save size={16} />
              {savingFields ? "Saving..." : "Save Field Edits"}
            </button>
            {selectedInvoice ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => downloadInvoicePdf(selectedInvoice.id)}
                >
                  Download Selected PDF
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void sendInvoiceToCustomer(selectedInvoice.id)}
                  disabled={Boolean(sendingInvoiceId)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                >
                  <Send size={16} />
                  {sendingInvoiceId === selectedInvoice.id ? "Sending..." : "Send to Customer"}
                </button>
              </>
            ) : null}
          </div>
        </article>

        <article className="glass-card" style={{ padding: "1rem" }}>
          <h3 style={{ margin: 0, color: "#1E293B", display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <FileText size={18} color="#4A90E2" />
            Generated Invoices
          </h3>

          {!selectedCompany ? (
            <p style={{ marginBottom: 0, color: "#64748B" }}>Select a company to view invoices.</p>
          ) : companyInvoices.length === 0 ? (
            <p style={{ marginBottom: 0, color: "#64748B" }}>
              No invoices generated for this company yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem", marginTop: "0.65rem" }}>
              {companyInvoices.map((invoice) => {
                const active = invoice.id === selectedInvoiceId;
                return (
                  <div
                    key={invoice.id}
                    style={{
                      border: "1px solid #E2E8F0",
                      borderRadius: "10px",
                      padding: "0.65rem",
                      background: active ? "#EFF6FF" : "#FFFFFF",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#1E293B" }}>{invoice.invoiceNumber}</div>
                        <div style={{ color: "#64748B", fontSize: "0.82rem" }}>
                          Generated: {formatDateTime(invoice.createdAt)}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setSelectedInvoiceId(invoice.id);
                            setEnterpriseDraft(invoice.enterpriseDetails);
                            setClusoDraft(invoice.clusoDetails);
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => downloadInvoicePdf(invoice.id)}
                        >
                          Download PDF
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void sendInvoiceToCustomer(invoice.id)}
                          disabled={Boolean(sendingInvoiceId)}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                        >
                          <Send size={15} />
                          {sendingInvoiceId === invoice.id ? "Sending..." : "Send to Customer"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </section>

      {selectedInvoice ? (
        <section className="glass-card" style={{ padding: "1rem", marginTop: "1rem" }}>
          <h3 style={{ marginTop: 0, color: "#1E293B" }}>Invoice Preview</h3>
          <div style={{ overflowX: "auto" }}>
            <article
              style={{
                minWidth: "880px",
                background: "#E8E8E8",
                border: "3px solid #8E1525",
                padding: "4px",
                boxShadow: "0 8px 30px rgba(15, 23, 42, 0.18)",
              }}
            >
              <div
                style={{
                  border: "1px solid #BBB26A",
                  padding: "2rem 2.4rem 1.5rem",
                  color: "#111111",
                  fontFamily: '"Times New Roman", Georgia, serif',
                }}
              >
                <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1.2rem" }}>
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        color: "#1F4597",
                        fontWeight: 700,
                        fontSize: "3rem",
                        lineHeight: 1.1,
                      }}
                    >
                      Invoice
                    </h2>
                    <p style={{ margin: "0.2rem 0 0", color: "#4B5563", fontSize: "1rem" }}>
                      Similar format as report with enterprise profile details.
                    </p>
                  </div>

                  <div style={{ color: "#5A5A5A", fontSize: "1rem", lineHeight: 1.45, textAlign: "right" }}>
                    <div>
                      <span style={{ fontWeight: 700, color: "#474747" }}>Invoice #:</span>{" "}
                      {selectedInvoice.invoiceNumber}
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: "#474747" }}>Generated:</span>{" "}
                      {formatDateTime(selectedInvoice.createdAt)}
                    </div>
                  </div>
                </header>

                <section
                  style={{
                    border: "1px solid #D1D1D1",
                    borderRadius: "6px",
                    padding: "0.8rem 1rem",
                    background: "rgba(255,255,255,0.43)",
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    columnGap: "1.3rem",
                    rowGap: "0.25rem",
                    fontSize: "1rem",
                    marginTop: "1.1rem",
                  }}
                >
                  <div>
                    <h4 style={{ margin: "0 0 0.35rem", color: "#1F4597", fontSize: "1.15rem" }}>
                      Customer Details - Enterprise Details
                    </h4>
                    <div><strong>Company Name:</strong> {selectedInvoice.enterpriseDetails.companyName || "-"}</div>
                    <div><strong>Login Email:</strong> {selectedInvoice.enterpriseDetails.loginEmail || "-"}</div>
                    <div><strong>GSTIN:</strong> {selectedInvoice.enterpriseDetails.gstin || "-"}</div>
                    <div><strong>CIN / Registration:</strong> {selectedInvoice.enterpriseDetails.cinRegistrationNumber || "-"}</div>
                    <div><strong>Address:</strong> {selectedInvoice.enterpriseDetails.address || "-"}</div>
                    <div><strong>Invoice Email:</strong> {selectedInvoice.enterpriseDetails.invoiceEmail || "-"}</div>
                    <div>
                      <strong>Billing same as company:</strong>{" "}
                      {selectedInvoice.enterpriseDetails.billingSameAsCompany ? "Yes" : "No"}
                    </div>
                    <div><strong>Billing Address:</strong> {selectedInvoice.enterpriseDetails.billingAddress || "-"}</div>
                  </div>

                  <div>
                    <h4 style={{ margin: "0 0 0.35rem", color: "#1F4597", fontSize: "1.15rem" }}>
                      Cluso Infolink Details
                    </h4>
                    <div><strong>Company Name:</strong> {selectedInvoice.clusoDetails.companyName || "-"}</div>
                    <div><strong>Login Email:</strong> {selectedInvoice.clusoDetails.loginEmail || "-"}</div>
                    <div><strong>GSTIN:</strong> {selectedInvoice.clusoDetails.gstin || "-"}</div>
                    <div><strong>CIN / Registration:</strong> {selectedInvoice.clusoDetails.cinRegistrationNumber || "-"}</div>
                    <div><strong>Address:</strong> {selectedInvoice.clusoDetails.address || "-"}</div>
                    <div><strong>Invoice Email:</strong> {selectedInvoice.clusoDetails.invoiceEmail || "-"}</div>
                    <div>
                      <strong>Billing same as company:</strong>{" "}
                      {selectedInvoice.clusoDetails.billingSameAsCompany ? "Yes" : "No"}
                    </div>
                    <div><strong>Billing Address:</strong> {selectedInvoice.clusoDetails.billingAddress || "-"}</div>
                  </div>
                </section>

                <section style={{ marginTop: "1.2rem" }}>
                  <h3 style={{ margin: "0 0 0.45rem", color: "#1F4597", fontSize: "1.5rem" }}>
                    Invoice Items (Latest Rates)
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: "660px", borderCollapse: "collapse", fontSize: "0.95rem" }}>
                      <thead>
                        <tr style={{ borderTop: "1px solid #232323", borderBottom: "1px solid #666666", textAlign: "left" }}>
                          <th style={{ padding: "0.35rem 0.2rem" }}>Service</th>
                          <th style={{ padding: "0.35rem 0.2rem", width: "14%" }}>Currency</th>
                          <th style={{ padding: "0.35rem 0.2rem", width: "20%" }}>Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedInvoice.lineItems.map((item, index) => (
                          <tr key={`${selectedInvoice.id}-line-${index}`} style={{ borderBottom: "1px solid #666666" }}>
                            <td style={{ padding: "0.35rem 0.2rem" }}>{item.serviceName}</td>
                            <td style={{ padding: "0.35rem 0.2rem" }}>{item.currency}</td>
                            <td style={{ padding: "0.35rem 0.2rem", fontWeight: 700 }}>
                              {formatMoney(item.price, item.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: "0.65rem", display: "grid", gap: "0.3rem" }}>
                    {selectedInvoice.totalsByCurrency.map((total) => (
                      <div key={`${selectedInvoice.id}-${total.currency}`} style={{ fontSize: "1rem" }}>
                        <strong>Total ({total.currency}):</strong> {formatMoney(total.subtotal, total.currency)}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </article>
          </div>
        </section>
      ) : null}
    </AdminPortalFrame>
  );
}
