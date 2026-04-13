"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  FileText,
  Printer,
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

type MonthlySummaryRow = {
  srNo: number;
  requestedAt: string;
  candidateName: string;
  userName: string;
  verifierName: string;
  requestStatus: string;
  serviceName: string;
  currency: string;
  subtotal: number;
  gstAmount: number;
  total: number;
};
type BuilderLineItem = {
  key: string;
  serviceName: string;
  usageCount: number | null;
  currency: string;
  price: number;
  lineTotal: number;
};

type MonthlySummaryData = {
  billingMonth: string;
  billingMonthLabel: string;
  billingPeriod: string;
  totalRequests: number;
  gstEnabled: boolean;
  gstRate: number;
  enterpriseDetails: InvoicePartyDetails;
  clusoDetails: InvoicePartyDetails;
  rows: MonthlySummaryRow[];
  totalsByCurrency: Array<{
    currency: string;
    subtotal: number;
    gstAmount: number;
    total: number;
  }>;
};

function createEmptyPartyDetails(): InvoicePartyDetails {
  return {
    companyName: "",
    loginEmail: "",
    gstin: "",
    cinRegistrationNumber: "",
    sacCode: "",
    ltuCode: "",
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
    sacCode: profile.companyInformation.sacCode?.trim() || "",
    ltuCode: profile.companyInformation.ltuCode?.trim() || "",
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

function formatSummaryDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getCurrentBillingMonth(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatBillingMonth(value: string) {
  const parsed = new Date(`${value}-01T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value || "-";
  }

  return parsed.toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatBillingPeriod(value: string) {
  const parsedStart = new Date(`${value}-01T00:00:00.000Z`);
  if (Number.isNaN(parsedStart.getTime())) {
    return "-";
  }

  const year = parsedStart.getUTCFullYear();
  const monthIndex = parsedStart.getUTCMonth();
  const parsedEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 0, 0, 0, 0));

  const formatOptions: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  };

  return `${parsedStart.toLocaleDateString("en-IN", formatOptions)} to ${parsedEnd.toLocaleDateString("en-IN", formatOptions)}`;
}

function formatInvoiceTotals(totals: InvoiceRecord["totalsByCurrency"]) {
  if (!Array.isArray(totals) || totals.length === 0) {
    return "-";
  }

  return totals
    .map((entry) => formatMoney(entry.subtotal, entry.currency))
    .join(" | ");
}

function clampGstRate(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return Math.round(value * 100) / 100;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function buildGstBreakdownRows(
  totals: Array<{ currency: string; subtotal: number }>,
  gstEnabled: boolean,
  gstRate: number,
) {
  const normalizedRate = clampGstRate(gstRate);

  return totals.map((entry) => {
    const subtotal = roundMoney(entry.subtotal);
    const gstAmount = gstEnabled ? roundMoney((subtotal * normalizedRate) / 100) : 0;
    const total = roundMoney(subtotal + gstAmount);

    return {
      currency: entry.currency,
      subtotal,
      gstAmount,
      total,
      gstRate: normalizedRate,
    };
  });
}

function buildCompanyGstDefaults(company: CompanyItem | null) {
  const invoicingInformation = company?.partnerProfile?.invoicingInformation;
  const gstRateRaw = Number(invoicingInformation?.gstRate);

  return {
    gstEnabled: Boolean(invoicingInformation?.gstEnabled),
    gstRate: Number.isFinite(gstRateRaw) ? clampGstRate(gstRateRaw) : 18,
  };
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
  const [selectedBillingMonth, setSelectedBillingMonth] =
    useState<string>(getCurrentBillingMonth);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstRate, setGstRate] = useState(18);
  const [enterpriseDraft, setEnterpriseDraft] =
    useState<InvoicePartyDetails>(createEmptyPartyDetails);
  const [clusoDraft, setClusoDraft] = useState<InvoicePartyDetails>(
    createEmptyPartyDetails,
  );

  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [message, setMessage] = useState("");
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [savingFields, setSavingFields] = useState(false);
  const [savingGstDefaults, setSavingGstDefaults] = useState(false);
  const [sendingInvoiceId, setSendingInvoiceId] = useState("");
  const [historyCompanyFilter, setHistoryCompanyFilter] = useState("all");
  const [historyMonthFilter, setHistoryMonthFilter] = useState("all");
  const [historySearchText, setHistorySearchText] = useState("");
  const [loadingMonthlySummary, setLoadingMonthlySummary] = useState(false);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryData | null>(null);
  const monthlySummaryPrintRef = useRef<HTMLDivElement | null>(null);

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

  const companyInvoiceMonths = useMemo(() => {
    const months = new Set<string>([getCurrentBillingMonth()]);
    for (const invoice of companyInvoices) {
      if (invoice.billingMonth) {
        months.add(invoice.billingMonth);
      }
    }

    return [...months].sort((first, second) => second.localeCompare(first));
  }, [companyInvoices]);

  const historyCompanyOptions = useMemo(
    () =>
      [...companies].sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
    [companies],
  );

  const historyMonthOptions = useMemo(() => {
    const months = new Set<string>();
    for (const invoice of invoices) {
      if (invoice.billingMonth) {
        months.add(invoice.billingMonth);
      }
    }

    return [...months].sort((first, second) => second.localeCompare(first));
  }, [invoices]);

  const normalizedHistorySearch = historySearchText.trim().toLowerCase();

  const historyInvoices = useMemo(
    () =>
      invoices
        .filter((invoice) => {
          if (
            historyCompanyFilter !== "all" &&
            invoice.customerId !== historyCompanyFilter
          ) {
            return false;
          }

          if (
            historyMonthFilter !== "all" &&
            invoice.billingMonth !== historyMonthFilter
          ) {
            return false;
          }

          if (!normalizedHistorySearch) {
            return true;
          }

          const searchableText = [
            invoice.invoiceNumber,
            invoice.customerName,
            invoice.customerEmail,
            invoice.billingMonth,
            invoice.generatedByName,
          ]
            .join(" ")
            .toLowerCase();

          return searchableText.includes(normalizedHistorySearch);
        })
        .sort(
          (first, second) =>
            new Date(second.createdAt).getTime() -
            new Date(first.createdAt).getTime(),
        ),
    [
      invoices,
      historyCompanyFilter,
      historyMonthFilter,
      normalizedHistorySearch,
    ],
  );

  const visibleCompanyInvoices = useMemo(
    () =>
      companyInvoices.filter((invoice) => {
        if (!selectedBillingMonth) {
          return true;
        }

        return invoice.billingMonth === selectedBillingMonth;
      }),
    [companyInvoices, selectedBillingMonth],
  );

  const selectedInvoice = useMemo(
    () => companyInvoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [companyInvoices, selectedInvoiceId],
  );

  const selectedMonthInvoice = useMemo(
    () => companyInvoices.find((invoice) => invoice.billingMonth === selectedBillingMonth) ?? null,
    [companyInvoices, selectedBillingMonth],
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

  const latestServiceTotalsWithGst = useMemo(
    () => buildGstBreakdownRows(latestServiceTotals, gstEnabled, gstRate),
    [latestServiceTotals, gstEnabled, gstRate],
  );
  const builderLineItems = useMemo(() => {
    if (selectedMonthInvoice) {
      return selectedMonthInvoice.lineItems.map((item, index) => ({
        key: `${selectedMonthInvoice.id}-${item.serviceId || item.serviceName}-${index}`,
        serviceName: item.serviceName,
        usageCount: item.usageCount,
        currency: item.currency,
        price: item.price,
        lineTotal: item.lineTotal,
      })) as BuilderLineItem[];
    }

    if (!selectedCompany) {
      return [] as BuilderLineItem[];
    }

    return selectedCompany.selectedServices.map((service, index) => ({
      key: `${selectedCompany.id}-${service.serviceId || service.serviceName}-${index}`,
      serviceName: service.serviceName,
      usageCount: null,
      currency: service.currency,
      price: service.price,
      lineTotal: service.price,
    })) as BuilderLineItem[];
  }, [selectedMonthInvoice, selectedCompany]);

  const builderTotalsWithGst = useMemo(() => {
    if (selectedMonthInvoice) {
      return buildGstBreakdownRows(
        selectedMonthInvoice.totalsByCurrency,
        selectedMonthInvoice.gstEnabled,
        selectedMonthInvoice.gstRate,
      );
    }

    return latestServiceTotalsWithGst;
  }, [selectedMonthInvoice, latestServiceTotalsWithGst]);

  const builderGstEnabled = selectedMonthInvoice
    ? selectedMonthInvoice.gstEnabled
    : gstEnabled;
  const builderGstRate = selectedMonthInvoice
    ? selectedMonthInvoice.gstRate
    : gstRate;

  const selectedInvoiceTotalsWithGst = useMemo(() => {
    if (!selectedInvoice) {
      return [] as Array<{
        currency: string;
        subtotal: number;
        gstAmount: number;
        total: number;
        gstRate: number;
      }>;
    }

    return buildGstBreakdownRows(
      selectedInvoice.totalsByCurrency,
      selectedInvoice.gstEnabled,
      selectedInvoice.gstRate,
    );
  }, [selectedInvoice]);

  const applyDraftDefaults = useCallback(
    (companyId: string, keepCurrentInvoiceSelection = false) => {
      const company = companies.find((entry) => entry.id === companyId);
      if (!company) {
        setEnterpriseDraft(createEmptyPartyDetails());
        setClusoDraft(clusoDefaultDetails);
        setGstEnabled(false);
        setGstRate(18);
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
        setGstEnabled(invoiceForCompany.gstEnabled);
        setGstRate(invoiceForCompany.gstRate);
        return;
      }

      const companyGstDefaults = buildCompanyGstDefaults(company);
      setEnterpriseDraft(buildEnterpriseDraft(company));
      setClusoDraft(clusoDefaultDetails);
      setGstEnabled(companyGstDefaults.gstEnabled);
      setGstRate(companyGstDefaults.gstRate);
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
        const fallbackCompanyMonth = nextInvoices
          .filter((invoice) => invoice.customerId === targetCompanyId)
          .map((invoice) => invoice.billingMonth)
          .sort((first, second) => second.localeCompare(first))[0];

        setSelectedBillingMonth(
          (currentMonth) =>
            targetInvoice?.billingMonth ||
            currentMonth ||
            fallbackCompanyMonth ||
            getCurrentBillingMonth(),
        );

        if (targetInvoice && targetInvoice.customerId === targetCompanyId) {
          setEnterpriseDraft(targetInvoice.enterpriseDetails);
          setClusoDraft(targetInvoice.clusoDetails);
          setGstEnabled(targetInvoice.gstEnabled);
          setGstRate(targetInvoice.gstRate);
        } else if (targetCompany) {
          const companyGstDefaults = buildCompanyGstDefaults(targetCompany);
          setEnterpriseDraft(buildEnterpriseDraft(targetCompany));
          setClusoDraft(nextClusoDefaults);
          setGstEnabled(companyGstDefaults.gstEnabled);
          setGstRate(companyGstDefaults.gstRate);
        } else {
          setEnterpriseDraft(createEmptyPartyDetails());
          setClusoDraft(nextClusoDefaults);
          setGstEnabled(false);
          setGstRate(18);
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
        const companyGstDefaults = buildCompanyGstDefaults(company);
        setEnterpriseDraft(buildEnterpriseDraft(company));
        setClusoDraft(clusoDefaultDetails);
        setGstEnabled(companyGstDefaults.gstEnabled);
        setGstRate(companyGstDefaults.gstRate);
      }
      return;
    }

    const invoice = invoices.find((entry) => entry.id === selectedInvoiceId);
    if (invoice && invoice.customerId === selectedCompanyId) {
      setEnterpriseDraft(invoice.enterpriseDetails);
      setClusoDraft(invoice.clusoDetails);
      setGstEnabled(invoice.gstEnabled);
      setGstRate(invoice.gstRate);
      return;
    }

    const company = companies.find((entry) => entry.id === selectedCompanyId);
    if (company) {
      const companyGstDefaults = buildCompanyGstDefaults(company);
      setEnterpriseDraft(buildEnterpriseDraft(company));
      setClusoDraft(clusoDefaultDetails);
      setGstEnabled(companyGstDefaults.gstEnabled);
      setGstRate(companyGstDefaults.gstRate);
    }
  }, [
    selectedCompanyId,
    selectedInvoiceId,
    companies,
    invoices,
    clusoDefaultDetails,
  ]);

  useEffect(() => {
    if (!selectedCompanyId || !selectedInvoiceId) {
      return;
    }

    const invoiceInMonth = companyInvoices.find(
      (invoice) =>
        invoice.id === selectedInvoiceId && invoice.billingMonth === selectedBillingMonth,
    );

    if (invoiceInMonth) {
      return;
    }

    setSelectedInvoiceId("");
    if (selectedCompany) {
      const companyGstDefaults = buildCompanyGstDefaults(selectedCompany);
      setEnterpriseDraft(buildEnterpriseDraft(selectedCompany));
      setClusoDraft(clusoDefaultDetails);
      setGstEnabled(companyGstDefaults.gstEnabled);
      setGstRate(companyGstDefaults.gstRate);
    }
  }, [
    selectedCompanyId,
    selectedInvoiceId,
    selectedBillingMonth,
    companyInvoices,
    selectedCompany,
    clusoDefaultDetails,
  ]);

  useEffect(() => {
    setMonthlySummary(null);
  }, [selectedCompanyId, selectedBillingMonth]);

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
          billingMonth: selectedBillingMonth,
          gstEnabled,
          gstRate: clampGstRate(gstRate),
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
          gstEnabled,
          gstRate: clampGstRate(gstRate),
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

  async function saveEnterpriseDefaultsToDb() {
    if (!selectedCompanyId) return;
    setSavingFields(true);
    setMessage("");

    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-enterprise-defaults",
          companyId: selectedCompanyId,
          enterpriseDetails: enterpriseDraft,
        }),
      });

      const data = await res.json() as { message?: string; error?: string };
      setMessage(data.message ?? data.error ?? "Error updating profile.");
      
      if (res.ok) {
        await loadWorkspace(selectedCompanyId, selectedInvoiceId);
      }
    } catch {
      setMessage("Could not save customer details to profile.");
    } finally {
      setSavingFields(false);
    }
  }

  async function saveCompanyGstDefaultsToDb() {
    if (!selectedCompanyId) {
      setMessage("Please choose a company first.");
      return;
    }

    setSavingGstDefaults(true);
    setMessage("");

    try {
      const normalizedRate = clampGstRate(gstRate);
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-company-gst-defaults",
          companyId: selectedCompanyId,
          gstEnabled,
          gstRate: normalizedRate,
        }),
      });

      const data = (await res.json()) as {
        message?: string;
        error?: string;
        gstEnabled?: boolean;
        gstRate?: number;
      };

      if (!res.ok) {
        setMessage(data.error ?? "Could not save company GST defaults.");
        return;
      }

      const savedGstEnabled =
        typeof data.gstEnabled === "boolean" ? data.gstEnabled : gstEnabled;
      const savedGstRate = clampGstRate(
        typeof data.gstRate === "number" ? data.gstRate : normalizedRate,
      );

      setGstEnabled(savedGstEnabled);
      setGstRate(savedGstRate);
      setCompanies((previous) =>
        previous.map((company) =>
          company.id === selectedCompanyId
            ? {
                ...company,
                partnerProfile: {
                  ...company.partnerProfile,
                  invoicingInformation: {
                    ...company.partnerProfile.invoicingInformation,
                    gstEnabled: savedGstEnabled,
                    gstRate: savedGstRate,
                  },
                },
              }
            : company,
        ),
      );

      setMessage(data.message ?? "Company GST defaults saved to profile.");
    } catch {
      setMessage("Could not save company GST defaults.");
    } finally {
      setSavingGstDefaults(false);
    }
  }

  async function saveClusoDefaultsToDb() {
    setSavingFields(true);
    setMessage("");

    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-cluso-defaults",
          clusoDetails: clusoDraft,
        }),
      });

      const data = await res.json() as { message?: string; error?: string };
      setMessage(data.message ?? data.error ?? "Error updating Cluso profile.");
      
      if (res.ok) {
        await loadWorkspace(selectedCompanyId, selectedInvoiceId);
      }
    } catch {
      setMessage("Could not save Cluso details to profile.");
    } finally {
      setSavingFields(false);
    }
  }

  async function loadMonthlySummary() {
    if (!selectedCompanyId) {
      setMessage("Please choose a company first.");
      return;
    }

    setLoadingMonthlySummary(true);
    setMessage("");

    try {
      const query = new URLSearchParams({
        action: "month-summary",
        companyId: selectedCompanyId,
        billingMonth: selectedBillingMonth,
      });

      const response = await fetch(`/api/invoices?${query.toString()}`, {
        cache: "no-store",
      });

      const data = (await response.json()) as {
        summary?: MonthlySummaryData;
        error?: string;
      };

      if (!response.ok) {
        setMessage(data.error ?? "Could not load billable month summary.");
        return;
      }

      if (!data.summary) {
        setMessage("No billable summary found for the selected month.");
        setMonthlySummary(null);
        return;
      }

      setMonthlySummary(data.summary);
      setMessage(
        `Loaded ${data.summary.billingMonthLabel} billable month summary (${data.summary.totalRequests} billable request(s)).`,
      );
    } catch {
      setMessage("Could not load billable month summary.");
    } finally {
      setLoadingMonthlySummary(false);
    }
  }

  function openInvoiceInWorkspace(invoice: InvoiceRecord) {
    setSelectedCompanyId(invoice.customerId);
    setSelectedBillingMonth(invoice.billingMonth || getCurrentBillingMonth());
    setSelectedInvoiceId(invoice.id);
    setEnterpriseDraft(invoice.enterpriseDetails);
    setClusoDraft(invoice.clusoDetails);
    setGstEnabled(invoice.gstEnabled);
    setGstRate(invoice.gstRate);
    setMessage(
      `Loaded ${invoice.invoiceNumber} for ${invoice.customerName} (${formatBillingMonth(invoice.billingMonth)}).`,
    );
  }

  function printMonthlySummary() {
    if (!monthlySummaryPrintRef.current) {
      setMessage("No month summary content available to print.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      setMessage("Pop-up blocked. Please allow pop-ups to print the summary.");
      return;
    }

    const printableHtml = monthlySummaryPrintRef.current.innerHTML;
    const baseHref = window.location.origin;

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <base href="${baseHref}" />
          <title>Monthly Summary</title>
          <style>
            body { margin: 16px; font-family: "Times New Roman", Georgia, serif; color: #111827; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #D1D5DB; padding: 6px; text-align: left; vertical-align: top; }
            h2, h3, h4 { margin: 0; }
            img { max-width: 180px; height: auto; }
          </style>
        </head>
        <body>${printableHtml}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();

    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
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
      subtitle="Generate month-wise invoices with billable service usage only (report generated and shared to customer)."
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
                            const latestCompanyMonth = invoices
                              .filter((invoice) => invoice.customerId === company.id)
                              .map((invoice) => invoice.billingMonth)
                              .sort((first, second) => second.localeCompare(first))[0];

                            setSelectedCompanyId(company.id);
                            setSelectedBillingMonth(latestCompanyMonth || getCurrentBillingMonth());
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

      <section className="glass-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.45rem", color: "#1E293B" }}>
              <FileText size={19} color="#4A90E2" />
              Invoice History Explorer
            </h2>
            <p style={{ margin: "0.35rem 0 0", color: "#64748B", fontSize: "0.85rem" }}>
              Access all previous invoices across every company and billing month.
            </p>
          </div>

          <div style={{ color: "#475569", fontSize: "0.85rem", fontWeight: 600 }}>
            Showing {historyInvoices.length} of {invoices.length} invoice(s)
          </div>
        </div>

        <div
          style={{
            marginTop: "0.8rem",
            display: "grid",
            gap: "0.7rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <div>
            <label className="label" htmlFor="history-company-filter" style={{ marginBottom: "0.25rem" }}>
              Company
            </label>
            <select
              id="history-company-filter"
              className="input"
              value={historyCompanyFilter}
              onChange={(event) => setHistoryCompanyFilter(event.target.value)}
            >
              <option value="all">All companies</option>
              {historyCompanyOptions.map((company) => (
                <option key={`history-company-${company.id}`} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="history-month-filter" style={{ marginBottom: "0.25rem" }}>
              Billing Month
            </label>
            <select
              id="history-month-filter"
              className="input"
              value={historyMonthFilter}
              onChange={(event) => setHistoryMonthFilter(event.target.value)}
            >
              <option value="all">All months</option>
              {historyMonthOptions.map((monthValue) => (
                <option key={`history-month-${monthValue}`} value={monthValue}>
                  {formatBillingMonth(monthValue)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="history-search" style={{ marginBottom: "0.25rem" }}>
              Search
            </label>
            <input
              id="history-search"
              className="input"
              placeholder="Invoice number, company, email, month"
              value={historySearchText}
              onChange={(event) => setHistorySearchText(event.target.value)}
            />
          </div>
        </div>

        {historyInvoices.length === 0 ? (
          <p style={{ margin: "0.8rem 0 0", color: "#64748B" }}>
            No invoices found for the current filters.
          </p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "0.8rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1160px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #E2E8F0" }}>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Invoice</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Company</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Billing Month</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Generated</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Totals</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Generated By</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyInvoices.map((invoice) => {
                  const isActive = invoice.id === selectedInvoiceId;
                  return (
                    <tr key={`history-invoice-${invoice.id}`} style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <td style={{ padding: "0.55rem", color: "#1E293B", fontWeight: 700 }}>
                        {invoice.invoiceNumber}
                      </td>
                      <td style={{ padding: "0.55rem", color: "#334155" }}>
                        <div>{invoice.customerName}</div>
                        <div style={{ color: "#64748B", fontSize: "0.8rem" }}>{invoice.customerEmail}</div>
                      </td>
                      <td style={{ padding: "0.55rem", color: "#334155" }}>
                        <div>{formatBillingMonth(invoice.billingMonth)}</div>
                        <div style={{ color: "#64748B", fontSize: "0.8rem" }}>
                          {formatBillingPeriod(invoice.billingMonth)}
                        </div>
                      </td>
                      <td style={{ padding: "0.55rem", color: "#334155" }}>{formatDateTime(invoice.createdAt)}</td>
                      <td style={{ padding: "0.55rem", color: "#1E293B", fontWeight: 600 }}>
                        {formatInvoiceTotals(invoice.totalsByCurrency)}
                      </td>
                      <td style={{ padding: "0.55rem", color: "#334155" }}>
                        {invoice.generatedByName || "-"}
                      </td>
                      <td style={{ padding: "0.55rem" }}>
                        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{
                              borderColor: isActive ? "#93C5FD" : undefined,
                              color: isActive ? "#1D4ED8" : undefined,
                            }}
                            onClick={() => openInvoiceInWorkspace(invoice)}
                          >
                            {isActive ? "Opened" : "Open"}
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
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                          >
                            <Send size={14} />
                            {sendingInvoiceId === invoice.id ? "Sending..." : "Send"}
                          </button>
                        </div>
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
          
          <button
            type="button"
            className="btn btn-secondary"
            style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: "0.45rem", marginTop: "0.5rem" }}
            onClick={() => void saveEnterpriseDefaultsToDb()}
            disabled={!selectedCompanyId || savingFields}
          >
            <Save size={16} />
            Save as Customer Defaults
          </button>
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

            <div>
              <label className="label" htmlFor="cluso-sac-code">SAC Code</label>
              <input
                id="cluso-sac-code"
                className="input"
                value={clusoDraft.sacCode}
                onChange={(event) =>
                  setClusoDraft((prev) =>
                    updatePartyDraft(prev, "sacCode", event.target.value),
                  )
                }
              />
            </div>

            <div>
              <label className="label" htmlFor="cluso-ltu-code">LTU Code</label>
              <input
                id="cluso-ltu-code"
                className="input"
                value={clusoDraft.ltuCode}
                onChange={(event) =>
                  setClusoDraft((prev) =>
                    updatePartyDraft(prev, "ltuCode", event.target.value),
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

          <button
            type="button"
            className="btn btn-secondary"
            style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: "0.45rem", marginTop: "0.5rem" }}
            onClick={() => void saveClusoDefaultsToDb()}
            disabled={savingFields}
          >
            <Save size={16} />
            Save as Cluso Defaults
          </button>
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
            Monthly Invoice Builder
          </h3>
          {!selectedCompany ? (
            <p style={{ marginBottom: 0, color: "#64748B" }}>Select a company to view rates.</p>
          ) : builderLineItems.length === 0 ? (
            <p style={{ marginBottom: 0, color: "#64748B" }}>
              No active services/rates found for this company.
            </p>
          ) : (
            <>
              <div style={{ overflowX: "auto", marginTop: "0.65rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #E2E8F0" }}>
                      <th style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#64748B" }}>Service</th>
                      <th style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#64748B" }}>Candidates</th>
                      <th style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#64748B" }}>Currency</th>
                      <th style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#64748B" }}>Rate</th>
                      <th style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#64748B" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {builderLineItems.map((item) => (
                      <tr key={item.key} style={{ borderBottom: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "0.45rem", color: "#334155" }}>{item.serviceName}</td>
                        <td style={{ padding: "0.45rem", color: "#334155" }}>
                          {item.usageCount ?? "-"}
                        </td>
                        <td style={{ padding: "0.45rem", color: "#334155" }}>{item.currency}</td>
                        <td style={{ padding: "0.45rem", color: "#1E293B", fontWeight: 600 }}>
                          {formatMoney(item.price, item.currency)}
                        </td>
                        <td style={{ padding: "0.45rem", color: "#1E293B", fontWeight: 700 }}>
                          {formatMoney(item.lineTotal, item.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p style={{ margin: "0.55rem 0 0", color: "#64748B", fontSize: "0.82rem" }}>
                {selectedMonthInvoice
                  ? `Showing values from generated ${formatBillingMonth(selectedBillingMonth)} invoice.`
                  : "Rate-only preview before generation. Final totals use billable request counts for the selected month."}
              </p>

              <div style={{ marginTop: "0.65rem", display: "grid", gap: "0.3rem" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "520px" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid #E2E8F0" }}>
                        <th style={{ padding: "0.4rem", fontSize: "0.8rem", color: "#64748B" }}>Currency</th>
                        <th style={{ padding: "0.4rem", fontSize: "0.8rem", color: "#64748B" }}>Sub Total</th>
                        <th style={{ padding: "0.4rem", fontSize: "0.8rem", color: "#64748B" }}>
                          {builderGstEnabled ? `GST @${clampGstRate(builderGstRate)}%` : "GST"}
                        </th>
                        <th style={{ padding: "0.4rem", fontSize: "0.8rem", color: "#64748B" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {builderTotalsWithGst.map((row) => (
                        <tr key={`builder-gst-${row.currency}`} style={{ borderBottom: "1px solid #F1F5F9" }}>
                          <td style={{ padding: "0.4rem", color: "#334155" }}>{row.currency}</td>
                          <td style={{ padding: "0.4rem", color: "#334155", fontWeight: 600 }}>
                            {formatMoney(row.subtotal, row.currency)}
                          </td>
                          <td style={{ padding: "0.4rem", color: "#334155", fontWeight: 600 }}>
                            {builderGstEnabled ? formatMoney(row.gstAmount, row.currency) : "-"}
                          </td>
                          <td style={{ padding: "0.4rem", color: "#1E293B", fontWeight: 700 }}>
                            {formatMoney(row.total, row.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <div
            style={{
              marginTop: "0.9rem",
              border: "1px solid #E2E8F0",
              borderRadius: "10px",
              padding: "0.75rem",
              background: "#F8FAFC",
              display: "grid",
              gap: "0.55rem",
              maxWidth: "320px",
            }}
          >
            <div style={{ fontWeight: 700, color: "#0F172A", fontSize: "0.88rem" }}>
              GST Settings
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", color: "#334155" }}>
              <input
                type="checkbox"
                checked={gstEnabled}
                onChange={(event) => setGstEnabled(event.target.checked)}
              />
              Enable GST
            </label>

            <div>
              <label className="label" htmlFor="invoice-gst-rate" style={{ marginBottom: "0.2rem" }}>
                GST Rate (%)
              </label>
              <input
                id="invoice-gst-rate"
                className="input"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={gstRate}
                disabled={!gstEnabled}
                onChange={(event) => {
                  const nextRate = Number(event.target.value);
                  if (Number.isFinite(nextRate)) {
                    setGstRate(nextRate);
                  }
                }}
                onBlur={() => setGstRate((prev) => clampGstRate(prev))}
              />
            </div>

            <p style={{ margin: 0, color: "#64748B", fontSize: "0.8rem" }}>
              Save GST as company default to auto-load it every time for this company.
              <br />
              Only billable requests (report generated and shared to customer) are included in totals.
            </p>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void saveCompanyGstDefaultsToDb()}
              disabled={!selectedCompany || savingGstDefaults}
              style={{
                justifySelf: "start",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
              }}
            >
              <Save size={16} />
              {savingGstDefaults ? "Saving GST..." : "Save GST as Company Default"}
            </button>
          </div>

          <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.35rem", maxWidth: "260px" }}>
            <label className="label" htmlFor="invoice-billing-month" style={{ marginBottom: 0 }}>
              Billing Month
            </label>
            <input
              id="invoice-billing-month"
              className="input"
              type="month"
              value={selectedBillingMonth}
              onChange={(event) =>
                setSelectedBillingMonth(event.target.value || getCurrentBillingMonth())
              }
            />
            <p style={{ margin: 0, color: "#64748B", fontSize: "0.8rem" }}>
              Only one invoice is kept per company per month. Generating again replaces the older invoice. Billing uses report share month.
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem", marginTop: "0.95rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void generateInvoice()}
              disabled={!selectedCompany || generatingInvoice}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
            >
              <CheckCircle2 size={16} />
              {generatingInvoice
                ? "Generating..."
                : `Generate ${formatBillingMonth(selectedBillingMonth)} Invoice`}
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
                const companyGstDefaults = buildCompanyGstDefaults(selectedCompany);
                setGstEnabled(companyGstDefaults.gstEnabled);
                setGstRate(companyGstDefaults.gstRate);
                setMessage("Loaded customer profile defaults and Cluso defaults.");
              }}
            >
              Use Profile Defaults
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (monthlySummary) {
                  setMonthlySummary(null);
                  return;
                }
                void loadMonthlySummary();
              }}
              disabled={!selectedCompany || loadingMonthlySummary}
            >
              {loadingMonthlySummary
                ? "Loading Summary..."
                : monthlySummary
                  ? "Hide Billable Summary"
                  : `View ${formatBillingMonth(selectedBillingMonth)} Billable Summary`}
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

          {selectedCompany ? (
            <div
              style={{
                marginTop: "0.7rem",
                display: "flex",
                justifyContent: "space-between",
                gap: "0.75rem",
                alignItems: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: "220px" }}>
                <label className="label" htmlFor="invoices-month-filter" style={{ marginBottom: "0.25rem" }}>
                  Month
                </label>
                <select
                  id="invoices-month-filter"
                  className="input"
                  value={selectedBillingMonth}
                  onChange={(event) =>
                    setSelectedBillingMonth(event.target.value || getCurrentBillingMonth())
                  }
                >
                  {companyInvoiceMonths.map((monthValue) => (
                    <option key={monthValue} value={monthValue}>
                      {formatBillingMonth(monthValue)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ color: "#64748B", fontSize: "0.85rem" }}>
                {visibleCompanyInvoices.length} invoice(s) for {formatBillingMonth(selectedBillingMonth)}
              </div>
            </div>
          ) : null}

          {!selectedCompany ? (
            <p style={{ marginBottom: 0, color: "#64748B" }}>Select a company to view invoices.</p>
          ) : visibleCompanyInvoices.length === 0 ? (
            <p style={{ marginBottom: 0, color: "#64748B" }}>
              No invoices generated for this company in {formatBillingMonth(selectedBillingMonth)}.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem", marginTop: "0.65rem" }}>
              {visibleCompanyInvoices.map((invoice) => {
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
                        <div style={{ color: "#475569", fontSize: "0.82rem" }}>
                          Billing Month: {formatBillingMonth(invoice.billingMonth)}
                        </div>
                        <div style={{ color: "#475569", fontSize: "0.82rem" }}>
                          Billing Period: {formatBillingPeriod(invoice.billingMonth)}
                        </div>
                        <div style={{ color: "#64748B", fontSize: "0.82rem" }}>
                          Generated: {formatDateTime(invoice.createdAt)}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setSelectedBillingMonth(invoice.billingMonth);
                            setSelectedInvoiceId(invoice.id);
                            setEnterpriseDraft(invoice.enterpriseDetails);
                            setClusoDraft(invoice.clusoDetails);
                            setGstEnabled(invoice.gstEnabled);
                            setGstRate(invoice.gstRate);
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

      {monthlySummary ? (
        <section className="glass-card" style={{ padding: "1rem", marginTop: "1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.6rem",
              flexWrap: "wrap",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 0, color: "#1E293B" }}>
              Billable Requests Summary ({monthlySummary.billingMonthLabel})
            </h3>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={printMonthlySummary}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Printer size={15} />
                Print Summary
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => selectedMonthInvoice && void sendInvoiceToCustomer(selectedMonthInvoice.id)}
                disabled={!selectedMonthInvoice || Boolean(sendingInvoiceId)}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                title={!selectedMonthInvoice ? "Generate invoice for this month first to send." : undefined}
              >
                <Send size={15} />
                {selectedMonthInvoice
                  ? sendingInvoiceId === selectedMonthInvoice.id
                    ? "Sending..."
                    : "Send to Customer"
                  : "No Invoice To Send"}
              </button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <article
              style={{
                minWidth: "960px",
                background: "#F6F2E9",
                border: "2px solid #8E1525",
                padding: "6px",
                boxShadow: "0 8px 30px rgba(15, 23, 42, 0.15)",
              }}
            >
              <div
                ref={monthlySummaryPrintRef}
                style={{
                  border: "1px solid #D2C8B6",
                  padding: "1.4rem 1.6rem 1.2rem",
                  color: "#1F2937",
                  fontFamily: '"Times New Roman", Georgia, serif',
                  background: "#FFFDF8",
                }}
              >
                <header
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        color: "#1F4597",
                        fontWeight: 700,
                        fontSize: "2rem",
                        lineHeight: 1.15,
                      }}
                    >
                      Billable Requests Summary
                    </h2>
                    <div style={{ marginTop: "0.35rem", color: "#4B5563", fontSize: "0.95rem" }}>
                      <div><strong>Billing Month:</strong> {monthlySummary.billingMonthLabel}</div>
                      <div><strong>Billing Period:</strong> {monthlySummary.billingPeriod}</div>
                      <div><strong>Total Billable Requests:</strong> {monthlySummary.totalRequests}</div>
                    </div>
                  </div>

                  <img
                    src="/images/cluso-infolink-logo.png"
                    alt="Cluso Infolink logo"
                    style={{ width: "170px", height: "auto", objectFit: "contain" }}
                  />
                </header>

                <p
                  style={{
                    margin: "0.8rem 0 0",
                    color: "#92400E",
                    fontSize: "0.9rem",
                    background: "#FEF3C7",
                    border: "1px solid #FDE68A",
                    borderRadius: "6px",
                    padding: "0.55rem 0.7rem",
                  }}
                >
                  This summary includes only billable requests: reports that were generated and shared to customer in this billing month.
                </p>

                <section
                  style={{
                    border: "1px solid #D1D1D1",
                    borderRadius: "6px",
                    padding: "0.8rem 1rem",
                    background: "rgba(255,255,255,0.7)",
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    columnGap: "1.3rem",
                    rowGap: "0.25rem",
                    fontSize: "1rem",
                    marginTop: "1rem",
                  }}
                >
                  <div>
                    <h4 style={{ margin: "0 0 0.35rem", color: "#1F4597", fontSize: "1.15rem" }}>
                      Customer Details - Enterprise Details
                    </h4>
                    <div><strong>Company Name:</strong> {monthlySummary.enterpriseDetails.companyName || "-"}</div>
                    <div><strong>Login Email:</strong> {monthlySummary.enterpriseDetails.loginEmail || "-"}</div>
                    <div><strong>GSTIN:</strong> {monthlySummary.enterpriseDetails.gstin || "-"}</div>
                    <div><strong>CIN / Registration:</strong> {monthlySummary.enterpriseDetails.cinRegistrationNumber || "-"}</div>
                    <div><strong>Address:</strong> {monthlySummary.enterpriseDetails.address || "-"}</div>
                    <div><strong>Invoice Email:</strong> {monthlySummary.enterpriseDetails.invoiceEmail || "-"}</div>
                    <div>
                      <strong>Billing same as company:</strong>{" "}
                      {monthlySummary.enterpriseDetails.billingSameAsCompany ? "Yes" : "No"}
                    </div>
                    <div><strong>Billing Address:</strong> {monthlySummary.enterpriseDetails.billingAddress || "-"}</div>
                  </div>

                  <div>
                    <h4 style={{ margin: "0 0 0.35rem", color: "#1F4597", fontSize: "1.15rem" }}>
                      Cluso Infolink Details
                    </h4>
                    <div><strong>Company Name:</strong> {monthlySummary.clusoDetails.companyName || "-"}</div>
                    <div><strong>Login Email:</strong> {monthlySummary.clusoDetails.loginEmail || "-"}</div>
                    <div><strong>GSTIN:</strong> {monthlySummary.clusoDetails.gstin || "-"}</div>
                    <div><strong>CIN / Registration:</strong> {monthlySummary.clusoDetails.cinRegistrationNumber || "-"}</div>
                    <div><strong>SAC Code:</strong> {monthlySummary.clusoDetails.sacCode || "-"}</div>
                    <div><strong>LTU Code:</strong> {monthlySummary.clusoDetails.ltuCode || "-"}</div>
                    <div><strong>Address:</strong> {monthlySummary.clusoDetails.address || "-"}</div>
                    <div><strong>Invoice Email:</strong> {monthlySummary.clusoDetails.invoiceEmail || "-"}</div>
                    <div>
                      <strong>Billing same as company:</strong>{" "}
                      {monthlySummary.clusoDetails.billingSameAsCompany ? "Yes" : "No"}
                    </div>
                    <div><strong>Billing Address:</strong> {monthlySummary.clusoDetails.billingAddress || "-"}</div>
                  </div>
                </section>

                <section style={{ marginTop: "1rem" }}>
                  <h4 style={{ margin: "0 0 0.45rem", color: "#1F4597", fontSize: "1.25rem" }}>
                    Candidate-wise Billable Summary
                  </h4>

                  {monthlySummary.rows.length === 0 ? (
                    <p style={{ margin: 0, color: "#6B7280" }}>
                      No billable requests found for the selected month.
                    </p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", minWidth: "1360px", borderCollapse: "collapse", fontSize: "0.92rem" }}>
                        <thead>
                          <tr style={{ borderTop: "1px solid #232323", borderBottom: "1px solid #666666", textAlign: "left" }}>
                            <th style={{ padding: "0.35rem 0.2rem", width: "6%" }}>Sr No.</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "14%" }}>Requested Date</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "14%" }}>Name of Candidate</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "14%" }}>User Name</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "12%" }}>Verifier Name</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "10%" }} title="Only requests with generated and customer-shared reports are included.">Status</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "16%" }}>Service</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "8%" }}>Currency</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "9%" }}>Price (Excl. GST)</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "7%" }}>
                              {monthlySummary.gstEnabled
                                ? `GST @${clampGstRate(monthlySummary.gstRate)}%`
                                : "GST"}
                            </th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "8%" }}>Price (Incl. GST)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlySummary.rows.map((row, index) => (
                            <tr key={`summary-row-${row.srNo}-${index}`} style={{ borderBottom: "1px solid #D1D5DB" }}>
                              <td style={{ padding: "0.35rem 0.2rem" }}>{row.srNo}</td>
                              <td style={{ padding: "0.35rem 0.2rem" }}>{formatSummaryDate(row.requestedAt)}</td>
                              <td style={{ padding: "0.35rem 0.2rem" }}>{row.candidateName}</td>
                              <td style={{ padding: "0.35rem 0.2rem" }}>{row.userName || "-"}</td>
                              <td style={{ padding: "0.35rem 0.2rem" }}>{row.verifierName || "-"}</td>
                              <td style={{ padding: "0.35rem 0.2rem", textTransform: "capitalize" }}>{row.requestStatus}</td>
                              <td style={{ padding: "0.35rem 0.2rem" }}>{row.serviceName}</td>
                              <td style={{ padding: "0.35rem 0.2rem" }}>{row.currency}</td>
                              <td style={{ padding: "0.35rem 0.2rem", fontWeight: 700 }}>
                                {formatMoney(row.subtotal, row.currency)}
                              </td>
                              <td style={{ padding: "0.35rem 0.2rem", fontWeight: 700 }}>
                                {monthlySummary.gstEnabled
                                  ? formatMoney(row.gstAmount, row.currency)
                                  : "-"}
                              </td>
                              <td style={{ padding: "0.35rem 0.2rem", fontWeight: 700 }}>
                                {formatMoney(row.total, row.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section style={{ marginTop: "0.9rem", overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: "560px", borderCollapse: "collapse", fontSize: "0.95rem" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderTop: "1px solid #232323", borderBottom: "1px solid #666666" }}>
                        <th style={{ padding: "0.35rem 0.2rem" }}>Currency</th>
                        <th style={{ padding: "0.35rem 0.2rem" }}>Sub Total</th>
                        <th style={{ padding: "0.35rem 0.2rem" }}>
                          {monthlySummary.gstEnabled
                            ? `GST @${clampGstRate(monthlySummary.gstRate)}%`
                            : "GST"}
                        </th>
                        <th style={{ padding: "0.35rem 0.2rem" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlySummary.totalsByCurrency.map((row) => (
                        <tr key={`summary-total-${row.currency}`} style={{ borderBottom: "1px solid #D1D5DB" }}>
                          <td style={{ padding: "0.35rem 0.2rem" }}>{row.currency}</td>
                          <td style={{ padding: "0.35rem 0.2rem", fontWeight: 700 }}>
                            {formatMoney(row.subtotal, row.currency)}
                          </td>
                          <td style={{ padding: "0.35rem 0.2rem", fontWeight: 700 }}>
                            {monthlySummary.gstEnabled
                              ? formatMoney(row.gstAmount, row.currency)
                              : "-"}
                          </td>
                          <td style={{ padding: "0.35rem 0.2rem", fontWeight: 700 }}>
                            {formatMoney(row.total, row.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            </article>
          </div>
        </section>
      ) : null}

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
                      Billing Period: {formatBillingPeriod(selectedInvoice.billingMonth)}
                    </p>
                    <img
                      src="/images/cluso-infolink-logo.png"
                      alt="Cluso Infolink logo"
                      style={{ marginTop: "0.45rem", width: "160px", height: "auto", objectFit: "contain" }}
                    />
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
                    <div>
                      <span style={{ fontWeight: 700, color: "#474747" }}>Billing Month:</span>{" "}
                      {formatBillingMonth(selectedInvoice.billingMonth)}
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: "#474747" }}>Billing Period:</span>{" "}
                      {formatBillingPeriod(selectedInvoice.billingMonth)}
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
                    <div><strong>SAC Code:</strong> {selectedInvoice.clusoDetails.sacCode || "-"}</div>
                    <div><strong>LTU Code:</strong> {selectedInvoice.clusoDetails.ltuCode || "-"}</div>
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
                    Invoice Items (Billable Service Usage)
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: "660px", borderCollapse: "collapse", fontSize: "0.95rem" }}>
                      <thead>
                        <tr style={{ borderTop: "1px solid #232323", borderBottom: "1px solid #666666", textAlign: "left" }}>
                          <th style={{ padding: "0.35rem 0.2rem" }}>Service</th>
                          <th style={{ padding: "0.35rem 0.2rem", width: "12%" }}>Candidates</th>
                          <th style={{ padding: "0.35rem 0.2rem", width: "14%" }}>Currency</th>
                          <th style={{ padding: "0.35rem 0.2rem", width: "16%" }}>Rate</th>
                          <th style={{ padding: "0.35rem 0.2rem", width: "18%" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedInvoice.lineItems.map((item, index) => (
                          <tr key={`${selectedInvoice.id}-line-${index}`} style={{ borderBottom: "1px solid #666666" }}>
                            <td style={{ padding: "0.35rem 0.2rem" }}>{item.serviceName}</td>
                            <td style={{ padding: "0.35rem 0.2rem" }}>{item.usageCount}</td>
                            <td style={{ padding: "0.35rem 0.2rem" }}>{item.currency}</td>
                            <td style={{ padding: "0.35rem 0.2rem", fontWeight: 700 }}>
                              {formatMoney(item.price, item.currency)}
                            </td>
                            <td style={{ padding: "0.35rem 0.2rem", fontWeight: 700 }}>
                              {formatMoney(item.lineTotal, item.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: "0.75rem", overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: "560px", borderCollapse: "collapse", fontSize: "0.95rem" }}>
                      <thead>
                        <tr style={{ textAlign: "left", borderTop: "1px solid #232323", borderBottom: "1px solid #666666" }}>
                          <th style={{ padding: "0.35rem 0.2rem" }}>Currency</th>
                          <th style={{ padding: "0.35rem 0.2rem" }}>Sub Total</th>
                          <th style={{ padding: "0.35rem 0.2rem" }}>
                            {selectedInvoice.gstEnabled
                              ? `GST @${clampGstRate(selectedInvoice.gstRate)}%`
                              : "GST"}
                          </th>
                          <th style={{ padding: "0.35rem 0.2rem" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedInvoiceTotalsWithGst.map((row) => (
                          <tr key={`${selectedInvoice.id}-${row.currency}-gst`} style={{ borderBottom: "1px solid #666666" }}>
                            <td style={{ padding: "0.35rem 0.2rem" }}>{row.currency}</td>
                            <td style={{ padding: "0.35rem 0.2rem", fontWeight: 700 }}>
                              {formatMoney(row.subtotal, row.currency)}
                            </td>
                            <td style={{ padding: "0.35rem 0.2rem", fontWeight: 700 }}>
                              {selectedInvoice.gstEnabled
                                ? formatMoney(row.gstAmount, row.currency)
                                : "-"}
                            </td>
                            <td style={{ padding: "0.35rem 0.2rem", fontWeight: 700 }}>
                              {formatMoney(row.total, row.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
