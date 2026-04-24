"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Eye,
  FileText,
  Landmark,
  Printer,
  QrCode,
  Save,
  Send,
  UserCircle2,
  X,
} from "lucide-react";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { MonthPicker } from "@/components/MonthPicker";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { getAlertTone } from "@/lib/alerts";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import type {
  CompanyItem,
  InvoicePaymentDetails,
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
  verificationOrigin: string;
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

function buildSummaryGroupSpans(rows: MonthlySummaryRow[]) {
  const spans = new Array(rows.length).fill(0);
  let start = 0;

  while (start < rows.length) {
    const currentSrNo = rows[start]?.srNo;
    let end = start + 1;

    while (end < rows.length && rows[end]?.srNo === currentSrNo) {
      end += 1;
    }

    spans[start] = end - start;
    start = end;
  }

  return spans;
}

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

function createEmptyPaymentDetails(): InvoicePaymentDetails {
  return {
    upi: {
      upiId: "",
      qrCodeImageUrl: "",
    },
    wireTransfer: {
      accountHolderName: "",
      accountNumber: "",
      bankName: "",
      ifscCode: "",
      branchName: "",
      swiftCode: "",
      instructions: "",
    },
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

function formatInvoiceTotals(invoice: InvoiceRecord) {
  const totalsWithGst = buildGstBreakdownRows(
    invoice.totalsByCurrency,
    invoice.gstEnabled,
    invoice.gstRate,
  );

  if (!Array.isArray(totalsWithGst) || totalsWithGst.length === 0) {
    return "-";
  }

  return totalsWithGst
    .map((entry) => formatMoney(entry.total, entry.currency))
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

function getPaymentStatusMeta(status: InvoiceRecord["paymentStatus"]) {
  if (status === "paid") {
    return {
      label: "Paid",
      background: "#DCFCE7",
      border: "#86EFAC",
      color: "#166534",
    };
  }

  if (status === "submitted") {
    return {
      label: "Payment In Process",
      background: "#FEF3C7",
      border: "#FDE68A",
      color: "#92400E",
    };
  }

  return {
    label: "Unpaid",
    background: "#E2E8F0",
    border: "#CBD5E1",
    color: "#334155",
  };
}

function canReviewPaymentProof(invoice: InvoiceRecord) {
  return Boolean(invoice.paymentProof);
}

function canMarkInvoiceAsPaid(invoice: InvoiceRecord) {
  return invoice.paymentStatus !== "paid";
}

function canMarkInvoiceAsUnpaid(invoice: InvoiceRecord) {
  return invoice.paymentStatus === "paid";
}

function getPaymentProofMethodLabel(method: "upi" | "wireTransfer" | "adminUpload") {
  if (method === "adminUpload") {
    return "Admin Upload";
  }

  return method === "wireTransfer" ? "Wire Transfer" : "UPI";
}

function hasAdminUploadedProof(invoice: InvoiceRecord) {
  return invoice.paymentProof?.method === "adminUpload";
}

function hasCustomerRelatedFiles(invoice: InvoiceRecord) {
  return Boolean(
    invoice.paymentProof &&
      invoice.paymentProof.method !== "adminUpload" &&
      invoice.paymentProof.relatedFiles.length > 0,
  );
}

function getPaymentProofViewLabel(invoice: InvoiceRecord) {
  return hasCustomerRelatedFiles(invoice) ? "View Customer Files" : "View Screenshot";
}

function getPaymentProofSummaryText(invoice: InvoiceRecord) {
  if (!invoice.paymentProof) {
    return "";
  }

  if (invoice.paymentStatus === "paid") {
    return "";
  }

  if (hasCustomerRelatedFiles(invoice)) {
    const relatedFilesCount = invoice.paymentProof.relatedFiles.length;
    return `Payment in process + ${relatedFilesCount} related file${relatedFilesCount === 1 ? "" : "s"}`;
  }

  return hasAdminUploadedProof(invoice)
    ? "Admin payment document uploaded"
    : "Payment in process";
}

export default function InvoicesPage() {
  const { me, loading, logout } = useAdminSession();
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [clusoDefaultDetails, setClusoDefaultDetails] =
    useState<InvoicePartyDetails>(createEmptyPartyDetails);
  const [clusoDefaultPaymentDetails, setClusoDefaultPaymentDetails] =
    useState<InvoicePaymentDetails>(createEmptyPaymentDetails);

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
  const [paymentDraft, setPaymentDraft] =
    useState<InvoicePaymentDetails>(createEmptyPaymentDetails);

  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [message, setMessage] = useState("");
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [savingFields, setSavingFields] = useState(false);
  const [savingGstDefaults, setSavingGstDefaults] = useState(false);
  const [sendingInvoiceId, setSendingInvoiceId] = useState("");
  const [updatingPaymentInvoiceId, setUpdatingPaymentInvoiceId] = useState("");
  const [adminUploadInvoiceId, setAdminUploadInvoiceId] = useState("");
  const [adminUploadData, setAdminUploadData] = useState("");
  const [adminUploadFileName, setAdminUploadFileName] = useState("");
  const [adminUploadMimeType, setAdminUploadMimeType] = useState("");
  const [adminUploadFileSize, setAdminUploadFileSize] = useState(0);
  const [uploadingAdminProofInvoiceId, setUploadingAdminProofInvoiceId] = useState("");
  const [paymentProofPreviewInvoiceId, setPaymentProofPreviewInvoiceId] = useState("");
  const [historyCompanyFilter, setHistoryCompanyFilter] = useState("all");
  const [historyMonthFilter, setHistoryMonthFilter] = useState("all");
  const [historySearchText, setHistorySearchText] = useState("");
  const [loadingMonthlySummary, setLoadingMonthlySummary] = useState(false);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryData | null>(null);
  const monthlySummaryGroupSpans = useMemo(
    () => buildSummaryGroupSpans(monthlySummary?.rows ?? []),
    [monthlySummary],
  );
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

  const paymentProofPreviewInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === paymentProofPreviewInvoiceId) ?? null,
    [invoices, paymentProofPreviewInvoiceId],
  );

  const adminUploadInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === adminUploadInvoiceId) ?? null,
    [invoices, adminUploadInvoiceId],
  );

  const adminUploadHasExistingProof =
    adminUploadInvoice?.paymentProof?.method === "adminUpload";

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
        setPaymentDraft(createEmptyPaymentDetails());
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
        setPaymentDraft(invoiceForCompany.paymentDetails);
        setGstEnabled(invoiceForCompany.gstEnabled);
        setGstRate(invoiceForCompany.gstRate);
        return;
      }

      const companyGstDefaults = buildCompanyGstDefaults(company);
      setEnterpriseDraft(buildEnterpriseDraft(company));
      setClusoDraft(clusoDefaultDetails);
      setPaymentDraft(clusoDefaultPaymentDetails);
      setGstEnabled(companyGstDefaults.gstEnabled);
      setGstRate(companyGstDefaults.gstRate);
      if (!keepCurrentInvoiceSelection) {
        setSelectedInvoiceId("");
      }
    },
    [
      companies,
      invoices,
      selectedInvoiceId,
      clusoDefaultDetails,
      clusoDefaultPaymentDetails,
    ],
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
        const nextClusoPaymentDefaults =
          invoicesPayload?.clusoDefaultPaymentDetails ?? createEmptyPaymentDetails();

        setCompanies(nextCompanies);
        setInvoices(nextInvoices);
        setClusoDefaultDetails(nextClusoDefaults);
        setClusoDefaultPaymentDetails(nextClusoPaymentDefaults);

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
          setPaymentDraft(targetInvoice.paymentDetails);
          setGstEnabled(targetInvoice.gstEnabled);
          setGstRate(targetInvoice.gstRate);
        } else if (targetCompany) {
          const companyGstDefaults = buildCompanyGstDefaults(targetCompany);
          setEnterpriseDraft(buildEnterpriseDraft(targetCompany));
          setClusoDraft(nextClusoDefaults);
          setPaymentDraft(nextClusoPaymentDefaults);
          setGstEnabled(companyGstDefaults.gstEnabled);
          setGstRate(companyGstDefaults.gstRate);
        } else {
          setEnterpriseDraft(createEmptyPartyDetails());
          setClusoDraft(nextClusoDefaults);
          setPaymentDraft(createEmptyPaymentDetails());
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
        setPaymentDraft(clusoDefaultPaymentDetails);
        setGstEnabled(companyGstDefaults.gstEnabled);
        setGstRate(companyGstDefaults.gstRate);
      }
      return;
    }

    const invoice = invoices.find((entry) => entry.id === selectedInvoiceId);
    if (invoice && invoice.customerId === selectedCompanyId) {
      setEnterpriseDraft(invoice.enterpriseDetails);
      setClusoDraft(invoice.clusoDetails);
      setPaymentDraft(invoice.paymentDetails);
      setGstEnabled(invoice.gstEnabled);
      setGstRate(invoice.gstRate);
      return;
    }

    const company = companies.find((entry) => entry.id === selectedCompanyId);
    if (company) {
      const companyGstDefaults = buildCompanyGstDefaults(company);
      setEnterpriseDraft(buildEnterpriseDraft(company));
      setClusoDraft(clusoDefaultDetails);
      setPaymentDraft(clusoDefaultPaymentDetails);
      setGstEnabled(companyGstDefaults.gstEnabled);
      setGstRate(companyGstDefaults.gstRate);
    }
  }, [
    selectedCompanyId,
    selectedInvoiceId,
    companies,
    invoices,
    clusoDefaultDetails,
    clusoDefaultPaymentDetails,
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
      setPaymentDraft(clusoDefaultPaymentDetails);
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
    clusoDefaultPaymentDetails,
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
          paymentDetails: paymentDraft,
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
          paymentDetails: paymentDraft,
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
          paymentDetails: paymentDraft,
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
    setPaymentDraft(invoice.paymentDetails);
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

  async function updateInvoicePaymentStatus(
    invoiceId: string,
    paymentStatus: "unpaid" | "submitted" | "paid",
    options?: {
      paymentProof?: InvoiceRecord["paymentProof"];
      clearPaymentProof?: boolean;
    },
  ) {
    if (!invoiceId) {
      return;
    }

    setUpdatingPaymentInvoiceId(invoiceId);
    setMessage("");

    try {
      const response = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-payment-status",
          invoiceId,
          paymentStatus,
          paymentProof: options?.paymentProof ?? undefined,
          clearPaymentProof: options?.clearPaymentProof ?? undefined,
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        error?: string;
        invoice?: InvoiceRecord;
      };

      if (!response.ok) {
        setMessage(data.error ?? "Could not update invoice payment status.");
        return;
      }

      setMessage(data.message ?? "Invoice payment status updated.");

      if (data.invoice) {
        setInvoices((previous) =>
          previous.map((invoice) =>
            invoice.id === data.invoice?.id ? data.invoice : invoice,
          ),
        );

        if (selectedInvoiceId === data.invoice.id) {
          setEnterpriseDraft(data.invoice.enterpriseDetails);
          setClusoDraft(data.invoice.clusoDetails);
          setPaymentDraft(data.invoice.paymentDetails);
          setGstEnabled(data.invoice.gstEnabled);
          setGstRate(data.invoice.gstRate);
        }
      }
    } catch {
      setMessage("Could not update invoice payment status.");
    } finally {
      setUpdatingPaymentInvoiceId("");
    }
  }

  function resetAdminUploadState() {
    setAdminUploadInvoiceId("");
    clearSelectedAdminUploadFile();
  }

  function clearSelectedAdminUploadFile() {
    setAdminUploadData("");
    setAdminUploadFileName("");
    setAdminUploadMimeType("");
    setAdminUploadFileSize(0);
  }

  function openAdminUploadModal(invoice: InvoiceRecord) {
    setAdminUploadInvoiceId(invoice.id);
    if (invoice.paymentProof?.method === "adminUpload") {
      setAdminUploadData(invoice.paymentProof.screenshotData);
      setAdminUploadFileName(invoice.paymentProof.screenshotFileName);
      setAdminUploadMimeType(invoice.paymentProof.screenshotMimeType);
      setAdminUploadFileSize(invoice.paymentProof.screenshotFileSize);
    } else {
      clearSelectedAdminUploadFile();
    }
    setMessage("");
  }

  async function onAdminProofFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      clearSelectedAdminUploadFile();
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("Please upload an image document (screenshot/photo).");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage("Payment document must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }

    const fileData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read the selected document."));
      reader.readAsDataURL(file);
    }).catch(() => "");

    if (!fileData) {
      setMessage("Could not read the selected document.");
      return;
    }

    setAdminUploadData(fileData);
    setAdminUploadFileName(file.name);
    setAdminUploadMimeType(file.type);
    setAdminUploadFileSize(file.size);
  }

  async function submitAdminPaymentProofAndMarkPaid() {
    if (!adminUploadInvoice) {
      return;
    }

    if (!adminUploadData || !adminUploadFileName || !adminUploadMimeType) {
      setMessage("Upload a payment document before marking as paid.");
      return;
    }

    setUploadingAdminProofInvoiceId(adminUploadInvoice.id);
    setMessage("");

    const paymentProof: InvoiceRecord["paymentProof"] = {
      method: "adminUpload",
      screenshotData: adminUploadData,
      screenshotFileName: adminUploadFileName,
      screenshotMimeType: adminUploadMimeType,
      screenshotFileSize: adminUploadFileSize,
      uploadedAt: new Date().toISOString(),
      relatedFiles: [],
    };

    try {
      await updateInvoicePaymentStatus(adminUploadInvoice.id, "paid", { paymentProof });
      resetAdminUploadState();
    } finally {
      setUploadingAdminProofInvoiceId("");
    }
  }

  if (loading || !me || loadingWorkspace) {
    return (
      <LoadingScreen
        title="Loading invoice workspace..."
        subtitle="Syncing companies, invoices, and billing defaults"
      />
    );
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
      subtitle="Generate month-wise invoices with billable service usage only (report generated or shared in the billing month)."
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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1280px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #E2E8F0" }}>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Invoice</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Company</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Billing Month</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Generated</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Totals (Incl GST)</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Generated By</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Payment</th>
                  <th style={{ padding: "0.55rem", fontSize: "0.8rem", color: "#64748B" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyInvoices.map((invoice) => {
                  const isActive = invoice.id === selectedInvoiceId;
                  const paymentStatusMeta = getPaymentStatusMeta(invoice.paymentStatus);
                  const paymentProofSummaryText = getPaymentProofSummaryText(invoice);
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
                        {formatInvoiceTotals(invoice)}
                      </td>
                      <td style={{ padding: "0.55rem", color: "#334155" }}>
                        {invoice.generatedByName || "-"}
                      </td>
                      <td style={{ padding: "0.55rem", color: "#334155" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: "999px",
                            border: `1px solid ${paymentStatusMeta.border}`,
                            background: paymentStatusMeta.background,
                            color: paymentStatusMeta.color,
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "0.2rem 0.55rem",
                          }}
                        >
                          {paymentStatusMeta.label}
                        </span>
                        {paymentProofSummaryText ? (
                          <div
                            style={{
                              color: hasAdminUploadedProof(invoice) ? "#1D4ED8" : "#0F766E",
                              fontSize: "0.76rem",
                              marginTop: "0.3rem",
                              fontWeight: 600,
                            }}
                          >
                            {paymentProofSummaryText}
                          </div>
                        ) : null}
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
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => openAdminUploadModal(invoice)}
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                          >
                            <FileText size={14} />
                            Upload & Mark Paid
                          </button>
                          {canReviewPaymentProof(invoice) ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setPaymentProofPreviewInvoiceId(invoice.id)}
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                            >
                              <Eye size={14} />
                              {getPaymentProofViewLabel(invoice)}
                            </button>
                          ) : null}
                          {canMarkInvoiceAsPaid(invoice) ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => void updateInvoicePaymentStatus(invoice.id, "paid")}
                              disabled={updatingPaymentInvoiceId === invoice.id}
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#86EFAC", color: "#166534" }}
                            >
                              <CheckCircle2 size={14} />
                              {updatingPaymentInvoiceId === invoice.id ? "Updating..." : "Mark Paid"}
                            </button>
                          ) : canMarkInvoiceAsUnpaid(invoice) ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => void updateInvoicePaymentStatus(invoice.id, "unpaid")}
                              disabled={updatingPaymentInvoiceId === invoice.id}
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#FCA5A5", color: "#991B1B" }}
                            >
                              <X size={14} />
                              {updatingPaymentInvoiceId === invoice.id ? "Updating..." : "Mark Unpaid"}
                            </button>
                          ) : null}
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

          <div
            style={{
              borderTop: "1px solid #E2E8F0",
              paddingTop: "0.8rem",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            <h4
              style={{
                margin: 0,
                color: "#1E293B",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                fontSize: "0.95rem",
              }}
            >
              <QrCode size={16} color="#0F766E" />
              Payment Collection Details
            </h4>

            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div>
                <label className="label" htmlFor="cluso-upi-id">UPI ID</label>
                <input
                  id="cluso-upi-id"
                  className="input"
                  value={paymentDraft.upi.upiId}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({
                      ...prev,
                      upi: {
                        ...prev.upi,
                        upiId: event.target.value,
                      },
                    }))
                  }
                  placeholder="company@upi"
                />
              </div>

              <div>
                <label className="label" htmlFor="cluso-upi-qr-url">UPI QR Code Image URL</label>
                <input
                  id="cluso-upi-qr-url"
                  className="input"
                  value={paymentDraft.upi.qrCodeImageUrl}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({
                      ...prev,
                      upi: {
                        ...prev.upi,
                        qrCodeImageUrl: event.target.value,
                      },
                    }))
                  }
                  placeholder="https://.../upi-qr.png"
                />
              </div>
            </div>

            {paymentDraft.upi.qrCodeImageUrl ? (
              <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.35rem" }}>
                <span style={{ color: "#475569", fontSize: "0.78rem", fontWeight: 600 }}>
                  QR Preview
                </span>
                <img
                  src={paymentDraft.upi.qrCodeImageUrl}
                  alt="UPI QR preview"
                  style={{ width: "130px", height: "130px", objectFit: "contain", border: "1px solid #CBD5E1", borderRadius: "10px", padding: "0.4rem", background: "#FFFFFF" }}
                />
              </div>
            ) : null}

            <h4
              style={{
                margin: 0,
                color: "#1E293B",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                fontSize: "0.95rem",
              }}
            >
              <Landmark size={16} color="#1D4ED8" />
              Wire Transfer Details
            </h4>

            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div>
                <label className="label" htmlFor="wire-account-holder">Account Holder Name</label>
                <input
                  id="wire-account-holder"
                  className="input"
                  value={paymentDraft.wireTransfer.accountHolderName}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({
                      ...prev,
                      wireTransfer: {
                        ...prev.wireTransfer,
                        accountHolderName: event.target.value,
                      },
                    }))
                  }
                />
              </div>

              <div>
                <label className="label" htmlFor="wire-account-number">Account Number</label>
                <input
                  id="wire-account-number"
                  className="input"
                  value={paymentDraft.wireTransfer.accountNumber}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({
                      ...prev,
                      wireTransfer: {
                        ...prev.wireTransfer,
                        accountNumber: event.target.value,
                      },
                    }))
                  }
                />
              </div>

              <div>
                <label className="label" htmlFor="wire-bank-name">Bank Name</label>
                <input
                  id="wire-bank-name"
                  className="input"
                  value={paymentDraft.wireTransfer.bankName}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({
                      ...prev,
                      wireTransfer: {
                        ...prev.wireTransfer,
                        bankName: event.target.value,
                      },
                    }))
                  }
                />
              </div>

              <div>
                <label className="label" htmlFor="wire-ifsc">IFSC Code</label>
                <input
                  id="wire-ifsc"
                  className="input"
                  value={paymentDraft.wireTransfer.ifscCode}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({
                      ...prev,
                      wireTransfer: {
                        ...prev.wireTransfer,
                        ifscCode: event.target.value,
                      },
                    }))
                  }
                />
              </div>

              <div>
                <label className="label" htmlFor="wire-branch">Branch Name</label>
                <input
                  id="wire-branch"
                  className="input"
                  value={paymentDraft.wireTransfer.branchName}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({
                      ...prev,
                      wireTransfer: {
                        ...prev.wireTransfer,
                        branchName: event.target.value,
                      },
                    }))
                  }
                />
              </div>

              <div>
                <label className="label" htmlFor="wire-swift">SWIFT Code</label>
                <input
                  id="wire-swift"
                  className="input"
                  value={paymentDraft.wireTransfer.swiftCode}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({
                      ...prev,
                      wireTransfer: {
                        ...prev.wireTransfer,
                        swiftCode: event.target.value,
                      },
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="wire-instructions">Transfer Instructions</label>
              <textarea
                id="wire-instructions"
                className="input"
                rows={2}
                value={paymentDraft.wireTransfer.instructions}
                onChange={(event) =>
                  setPaymentDraft((prev) => ({
                    ...prev,
                    wireTransfer: {
                      ...prev.wireTransfer,
                      instructions: event.target.value,
                    },
                  }))
                }
                style={{ resize: "vertical" }}
                placeholder="Add any remittance instructions or reference notes"
              />
            </div>
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
            <MonthPicker
              id="invoice-billing-month"
              value={selectedBillingMonth}
              onChange={(value) =>
                setSelectedBillingMonth(value || getCurrentBillingMonth())
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
                setPaymentDraft(clusoDefaultPaymentDetails);
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
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: "999px",
                    border: `1px solid ${getPaymentStatusMeta(selectedInvoice.paymentStatus).border}`,
                    background: getPaymentStatusMeta(selectedInvoice.paymentStatus).background,
                    color: getPaymentStatusMeta(selectedInvoice.paymentStatus).color,
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    padding: "0.32rem 0.7rem",
                  }}
                >
                  {getPaymentStatusMeta(selectedInvoice.paymentStatus).label}
                </span>
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
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openAdminUploadModal(selectedInvoice)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                >
                  <FileText size={16} />
                  Upload Document & Mark Paid
                </button>
                {canReviewPaymentProof(selectedInvoice) ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPaymentProofPreviewInvoiceId(selectedInvoice.id)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                  >
                    <Eye size={16} />
                    {getPaymentProofViewLabel(selectedInvoice)}
                  </button>
                ) : null}
                {canMarkInvoiceAsPaid(selectedInvoice) ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void updateInvoicePaymentStatus(selectedInvoice.id, "paid")}
                    disabled={updatingPaymentInvoiceId === selectedInvoice.id}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", borderColor: "#86EFAC", color: "#166534" }}
                  >
                    <CheckCircle2 size={16} />
                    {updatingPaymentInvoiceId === selectedInvoice.id ? "Updating..." : "Mark Paid"}
                  </button>
                ) : canMarkInvoiceAsUnpaid(selectedInvoice) ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void updateInvoicePaymentStatus(selectedInvoice.id, "unpaid")}
                    disabled={updatingPaymentInvoiceId === selectedInvoice.id}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", borderColor: "#FCA5A5", color: "#991B1B" }}
                  >
                    <X size={16} />
                    {updatingPaymentInvoiceId === selectedInvoice.id ? "Updating..." : "Mark Unpaid"}
                  </button>
                ) : null}
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
                const paymentStatusMeta = getPaymentStatusMeta(invoice.paymentStatus);
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
                        <div style={{ marginTop: "0.35rem" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              borderRadius: "999px",
                              border: `1px solid ${paymentStatusMeta.border}`,
                              background: paymentStatusMeta.background,
                              color: paymentStatusMeta.color,
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              padding: "0.2rem 0.55rem",
                            }}
                          >
                            {paymentStatusMeta.label}
                          </span>
                          {invoice.paymentProof ? (
                            <span
                              style={{
                                marginLeft: "0.45rem",
                                color: hasAdminUploadedProof(invoice) ? "#1D4ED8" : "#0F766E",
                                fontSize: "0.76rem",
                                fontWeight: 600,
                              }}
                            >
                              {getPaymentProofSummaryText(invoice)}
                            </span>
                          ) : null}
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
                            setPaymentDraft(invoice.paymentDetails);
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
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => openAdminUploadModal(invoice)}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                        >
                          <FileText size={15} />
                          Upload & Mark Paid
                        </button>
                        {canReviewPaymentProof(invoice) ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setPaymentProofPreviewInvoiceId(invoice.id)}
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                          >
                            <Eye size={15} />
                            {getPaymentProofViewLabel(invoice)}
                          </button>
                        ) : null}
                        {canMarkInvoiceAsPaid(invoice) ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void updateInvoicePaymentStatus(invoice.id, "paid")}
                            disabled={updatingPaymentInvoiceId === invoice.id}
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#86EFAC", color: "#166534" }}
                          >
                            <CheckCircle2 size={15} />
                            {updatingPaymentInvoiceId === invoice.id ? "Updating..." : "Mark Paid"}
                          </button>
                        ) : canMarkInvoiceAsUnpaid(invoice) ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void updateInvoicePaymentStatus(invoice.id, "unpaid")}
                            disabled={updatingPaymentInvoiceId === invoice.id}
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#FCA5A5", color: "#991B1B" }}
                          >
                            <X size={15} />
                            {updatingPaymentInvoiceId === invoice.id ? "Updating..." : "Mark Unpaid"}
                          </button>
                        ) : null}
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
        <section style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
                      <table style={{ width: "100%", minWidth: "1500px", borderCollapse: "collapse", fontSize: "0.92rem" }}>
                        <thead>
                          <tr style={{ borderTop: "1px solid #232323", borderBottom: "1px solid #666666", textAlign: "left" }}>
                            <th style={{ padding: "0.35rem 0.2rem", width: "6%" }}>Sr No.</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "14%" }}>Requested Date</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "14%" }}>Name of Candidate</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "14%" }}>User Name</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "12%" }}>Verifier Name</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "10%" }} title="Only requests with generated and customer-shared reports are included.">Status</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "16%" }}>Service</th>
                            <th style={{ padding: "0.35rem 0.2rem", width: "12%" }}>Verification Origin</th>
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
                          {monthlySummary.rows.map((row, index) => {
                            const rowSpan = monthlySummaryGroupSpans[index] ?? 0;
                            const showMergedCells = rowSpan > 0;

                            return (
                              <tr key={`summary-row-${row.srNo}-${index}`} style={{ borderBottom: "1px solid #D1D5DB" }}>
                                {showMergedCells ? (
                                  <td rowSpan={rowSpan} style={{ padding: "0.35rem 0.2rem", verticalAlign: "top" }}>
                                    {row.srNo}
                                  </td>
                                ) : null}
                                {showMergedCells ? (
                                  <td rowSpan={rowSpan} style={{ padding: "0.35rem 0.2rem", verticalAlign: "top" }}>
                                    {formatSummaryDate(row.requestedAt)}
                                  </td>
                                ) : null}
                                {showMergedCells ? (
                                  <td rowSpan={rowSpan} style={{ padding: "0.35rem 0.2rem", verticalAlign: "top" }}>
                                    {row.candidateName}
                                  </td>
                                ) : null}
                                {showMergedCells ? (
                                  <td rowSpan={rowSpan} style={{ padding: "0.35rem 0.2rem", verticalAlign: "top" }}>
                                    {row.userName || "-"}
                                  </td>
                                ) : null}
                                {showMergedCells ? (
                                  <td rowSpan={rowSpan} style={{ padding: "0.35rem 0.2rem", verticalAlign: "top" }}>
                                    {row.verifierName || "-"}
                                  </td>
                                ) : null}
                                <td style={{ padding: "0.35rem 0.2rem", textTransform: "capitalize" }}>{row.requestStatus}</td>
                                <td style={{ padding: "0.35rem 0.2rem" }}>{row.serviceName}</td>
                                <td style={{ padding: "0.35rem 0.2rem" }}>{row.verificationOrigin}</td>
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
                            );
                          })}
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
                    <div style={{ marginTop: "0.35rem", paddingTop: "0.35rem", borderTop: "1px dashed #CBD5E1" }}>
                      <strong>UPI ID:</strong> {selectedInvoice.paymentDetails.upi.upiId || "-"}
                    </div>
                    <div>
                      <strong>UPI QR:</strong>{" "}
                      {selectedInvoice.paymentDetails.upi.qrCodeImageUrl ? "Configured" : "-"}
                    </div>
                    <div>
                      <strong>Wire Account Holder:</strong>{" "}
                      {selectedInvoice.paymentDetails.wireTransfer.accountHolderName || "-"}
                    </div>
                    <div>
                      <strong>Wire Account Number:</strong>{" "}
                      {selectedInvoice.paymentDetails.wireTransfer.accountNumber || "-"}
                    </div>
                    <div>
                      <strong>Wire Bank / IFSC:</strong>{" "}
                      {selectedInvoice.paymentDetails.wireTransfer.bankName || "-"}
                      {selectedInvoice.paymentDetails.wireTransfer.ifscCode
                        ? ` / ${selectedInvoice.paymentDetails.wireTransfer.ifscCode}`
                        : ""}
                    </div>
                    <div style={{ marginTop: "0.35rem", paddingTop: "0.35rem", borderTop: "1px dashed #CBD5E1" }}>
                      <strong>Payment Status:</strong>{" "}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          borderRadius: "999px",
                          border: `1px solid ${getPaymentStatusMeta(selectedInvoice.paymentStatus).border}`,
                          background: getPaymentStatusMeta(selectedInvoice.paymentStatus).background,
                          color: getPaymentStatusMeta(selectedInvoice.paymentStatus).color,
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          padding: "0.12rem 0.5rem",
                        }}
                      >
                        {getPaymentStatusMeta(selectedInvoice.paymentStatus).label}
                      </span>
                    </div>
                    {selectedInvoice.paymentProof ? (
                      hasAdminUploadedProof(selectedInvoice) ? (
                        <>
                          <div style={{ marginTop: "0.35rem", paddingTop: "0.35rem", borderTop: "1px dashed #CBD5E1" }}>
                            <strong>Admin Payment Document:</strong> Uploaded by admin
                          </div>
                          <div>
                            <strong>Uploaded At:</strong>{" "}
                            {formatDateTime(selectedInvoice.paymentProof.uploadedAt)}
                          </div>
                          <div style={{ color: "#1D4ED8", fontSize: "0.78rem", fontWeight: 600 }}>
                            Stored as Admin Upload (separate from customer UPI/Wire receipt).
                          </div>
                          <div style={{ marginTop: "0.45rem", display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setPaymentProofPreviewInvoiceId(selectedInvoice.id)}
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                            >
                              <Eye size={14} />
                              {getPaymentProofViewLabel(selectedInvoice)}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => openAdminUploadModal(selectedInvoice)}
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#93C5FD", color: "#1D4ED8" }}
                            >
                              <FileText size={14} />
                              Edit File
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() =>
                                void updateInvoicePaymentStatus(selectedInvoice.id, selectedInvoice.paymentStatus, {
                                  clearPaymentProof: true,
                                })
                              }
                              disabled={updatingPaymentInvoiceId === selectedInvoice.id}
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#FCA5A5", color: "#991B1B" }}
                            >
                              <X size={14} />
                              {updatingPaymentInvoiceId === selectedInvoice.id ? "Removing..." : "Remove File"}
                            </button>
                          </div>
                          <div style={{ marginTop: "0.45rem" }}>
                            <img
                              src={selectedInvoice.paymentProof.screenshotData}
                              alt="Admin uploaded payment document"
                              style={{
                                width: "160px",
                                maxWidth: "100%",
                                border: "1px solid #CBD5E1",
                                borderRadius: "8px",
                                background: "#FFFFFF",
                                padding: "0.25rem",
                                objectFit: "contain",
                              }}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <strong>Receipt Method:</strong>{" "}
                            {getPaymentProofMethodLabel(selectedInvoice.paymentProof.method)}
                          </div>
                          <div>
                            <strong>Receipt Uploaded At:</strong>{" "}
                            {formatDateTime(selectedInvoice.paymentProof.uploadedAt)}
                          </div>
                          <div style={{ color: "#0F766E", fontSize: "0.78rem", fontWeight: 600 }}>
                            Payment in process
                          </div>
                          {selectedInvoice.paymentProof.relatedFiles.length > 0 ? (
                            <div style={{ color: "#0F766E", fontSize: "0.78rem", fontWeight: 600 }}>
                              Customer related files: {selectedInvoice.paymentProof.relatedFiles.length}
                            </div>
                          ) : null}
                          <div style={{ marginTop: "0.45rem" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setPaymentProofPreviewInvoiceId(selectedInvoice.id)}
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                            >
                              <Eye size={14} />
                              {getPaymentProofViewLabel(selectedInvoice)}
                            </button>
                          </div>
                          <div style={{ marginTop: "0.45rem" }}>
                            <img
                              src={selectedInvoice.paymentProof.screenshotData}
                              alt="Customer uploaded payment receipt"
                              style={{
                                width: "160px",
                                maxWidth: "100%",
                                border: "1px solid #CBD5E1",
                                borderRadius: "8px",
                                background: "#FFFFFF",
                                padding: "0.25rem",
                                objectFit: "contain",
                              }}
                            />
                          </div>
                        </>
                      )
                    ) : (
                      <div style={{ color: "#64748B", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                        Client receipt not uploaded yet.
                      </div>
                    )}
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

                {paymentProofPreviewInvoice?.paymentProof ? (
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Payment proof preview"
                    onClick={() => setPaymentProofPreviewInvoiceId("")}
                    style={{
                      position: "fixed",
                      inset: 0,
                      zIndex: 60,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "1rem",
                      background: "rgba(15, 23, 42, 0.65)",
                    }}
                  >
                    <div
                      onClick={(event) => event.stopPropagation()}
                      style={{
                        width: "min(940px, 100%)",
                        maxHeight: "90vh",
                        overflowY: "auto",
                        borderRadius: "18px",
                        background: "#FFFFFF",
                        padding: "1rem",
                        boxShadow: "0 24px 80px rgba(15, 23, 42, 0.35)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "0.9rem" }}>
                        <div>
                          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0F172A" }}>
                            {paymentProofPreviewInvoice.invoiceNumber}
                          </div>
                          <div style={{ color: "#475569", fontSize: "0.9rem" }}>
                            {paymentProofPreviewInvoice.customerName}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setPaymentProofPreviewInvoiceId("")}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                        >
                          <X size={14} />
                          Close
                        </button>
                      </div>

                      <div style={{ display: "grid", gap: "0.75rem" }}>
                        <div style={{ color: "#64748B", fontSize: "0.9rem" }}>
                          Uploaded {formatDateTime(paymentProofPreviewInvoice.paymentProof.uploadedAt)} via {getPaymentProofMethodLabel(paymentProofPreviewInvoice.paymentProof.method)}
                        </div>
                        <div style={{ color: "#475569", fontSize: "0.85rem" }}>
                          File: {paymentProofPreviewInvoice.paymentProof.screenshotFileName}
                        </div>
                        {paymentProofPreviewInvoice.paymentProof.method !== "adminUpload" &&
                        paymentProofPreviewInvoice.paymentProof.relatedFiles.length > 0 ? (
                          <div
                            style={{
                              border: "1px solid #BFDBFE",
                              borderRadius: "10px",
                              background: "#EFF6FF",
                              padding: "0.7rem",
                              display: "grid",
                              gap: "0.55rem",
                            }}
                          >
                            <div style={{ color: "#1E3A8A", fontSize: "0.82rem", fontWeight: 700 }}>
                              Customer Related Verification Files
                            </div>
                            <div style={{ display: "grid", gap: "0.55rem" }}>
                              {paymentProofPreviewInvoice.paymentProof.relatedFiles.map((relatedFile, index) => {
                                const isImage = relatedFile.fileMimeType.startsWith("image/");
                                return (
                                  <div
                                    key={`${paymentProofPreviewInvoice.id}-related-preview-${index}`}
                                    style={{
                                      border: "1px solid #93C5FD",
                                      borderRadius: "8px",
                                      background: "#FFFFFF",
                                      padding: "0.5rem",
                                      display: "grid",
                                      gap: "0.35rem",
                                    }}
                                  >
                                    <div style={{ color: "#1E293B", fontSize: "0.8rem", fontWeight: 700 }}>
                                      {relatedFile.fileName || `Related file ${index + 1}`}
                                    </div>
                                    <div style={{ color: "#64748B", fontSize: "0.76rem" }}>
                                      Uploaded: {formatDateTime(relatedFile.uploadedAt)}
                                    </div>
                                    <a
                                      href={relatedFile.fileData}
                                      target="_blank"
                                      rel="noreferrer"
                                      download={relatedFile.fileName || `related-file-${index + 1}`}
                                      style={{
                                        border: "1px solid #93C5FD",
                                        background: "#EFF6FF",
                                        color: "#1D4ED8",
                                        borderRadius: "8px",
                                        fontSize: "0.76rem",
                                        fontWeight: 700,
                                        padding: "0.3rem 0.52rem",
                                        textDecoration: "none",
                                        width: "fit-content",
                                      }}
                                    >
                                      Open or Download
                                    </a>
                                    {isImage ? (
                                      <img
                                        src={relatedFile.fileData}
                                        alt={relatedFile.fileName || "Customer related verification file"}
                                        style={{
                                          width: "min(220px, 100%)",
                                          border: "1px solid #CBD5E1",
                                          borderRadius: "8px",
                                          background: "#F8FAFC",
                                          padding: "0.2rem",
                                          objectFit: "contain",
                                        }}
                                      />
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                        <img
                          src={paymentProofPreviewInvoice.paymentProof.screenshotData}
                          alt={
                            paymentProofPreviewInvoice.paymentProof.method === "adminUpload"
                              ? "Admin uploaded payment document"
                              : "Customer uploaded payment receipt"
                          }
                          style={{
                            width: "100%",
                            maxHeight: "70vh",
                            objectFit: "contain",
                            borderRadius: "14px",
                            border: "1px solid #CBD5E1",
                            background: "#F8FAFC",
                          }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", flexWrap: "wrap" }}>
                          {paymentProofPreviewInvoice.paymentProof.method === "adminUpload" ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                  setPaymentProofPreviewInvoiceId("");
                                  openAdminUploadModal(paymentProofPreviewInvoice);
                                }}
                                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#93C5FD", color: "#1D4ED8" }}
                              >
                                <FileText size={14} />
                                Edit File
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() =>
                                  void updateInvoicePaymentStatus(
                                    paymentProofPreviewInvoice.id,
                                    paymentProofPreviewInvoice.paymentStatus,
                                    { clearPaymentProof: true },
                                  )
                                }
                                disabled={updatingPaymentInvoiceId === paymentProofPreviewInvoice.id}
                                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#FCA5A5", color: "#991B1B" }}
                              >
                                <X size={14} />
                                {updatingPaymentInvoiceId === paymentProofPreviewInvoice.id ? "Removing..." : "Remove File"}
                              </button>
                            </>
                          ) : null}
                          {canMarkInvoiceAsPaid(paymentProofPreviewInvoice) ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => void updateInvoicePaymentStatus(paymentProofPreviewInvoice.id, "paid")}
                              disabled={updatingPaymentInvoiceId === paymentProofPreviewInvoice.id}
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#86EFAC", color: "#166534" }}
                            >
                              <CheckCircle2 size={14} />
                              {updatingPaymentInvoiceId === paymentProofPreviewInvoice.id ? "Updating..." : "Mark as Paid"}
                            </button>
                          ) : canMarkInvoiceAsUnpaid(paymentProofPreviewInvoice) ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => void updateInvoicePaymentStatus(paymentProofPreviewInvoice.id, "unpaid")}
                              disabled={updatingPaymentInvoiceId === paymentProofPreviewInvoice.id}
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#FCA5A5", color: "#991B1B" }}
                            >
                              <X size={14} />
                              {updatingPaymentInvoiceId === paymentProofPreviewInvoice.id ? "Updating..." : "Mark as Unpaid"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {adminUploadInvoice ? (
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Admin payment document upload"
                    onClick={() => resetAdminUploadState()}
                    style={{
                      position: "fixed",
                      inset: 0,
                      zIndex: 70,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "1rem",
                      background: "rgba(15, 23, 42, 0.65)",
                    }}
                  >
                    <div
                      onClick={(event) => event.stopPropagation()}
                      style={{
                        width: "min(720px, 100%)",
                        borderRadius: "16px",
                        background: "#FFFFFF",
                        padding: "1rem",
                        boxShadow: "0 24px 80px rgba(15, 23, 42, 0.35)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.7rem" }}>
                        <div>
                          <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0F172A" }}>
                            Upload Payment Document
                          </div>
                          <div style={{ fontSize: "0.88rem", color: "#475569" }}>
                            {adminUploadInvoice.invoiceNumber} - {adminUploadInvoice.customerName}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => resetAdminUploadState()}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                        >
                          <X size={14} />
                          Close
                        </button>
                      </div>

                      <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.75rem" }}>
                        <p style={{ margin: 0, color: "#64748B", fontSize: "0.88rem" }}>
                          {adminUploadHasExistingProof
                            ? "This invoice already has an admin-uploaded document. Replace it or remove it before saving."
                            : "Upload payment document (screenshot/photo). It will be stored as Admin Upload and kept separate from customer UPI/Wire receipts."}
                        </p>

                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            void onAdminProofFileChange(event);
                          }}
                          style={{
                            border: "1px dashed #CBD5E1",
                            borderRadius: "10px",
                            padding: "0.65rem",
                            background: "#F8FAFC",
                          }}
                        />

                        {adminUploadFileName ? (
                          <div
                            style={{
                              border: "1px solid #E2E8F0",
                              borderRadius: "10px",
                              padding: "0.6rem 0.75rem",
                              background: "#F8FAFC",
                              fontSize: "0.84rem",
                              color: "#334155",
                            }}
                          >
                            <div><strong>File:</strong> {adminUploadFileName}</div>
                            <div><strong>Type:</strong> {adminUploadMimeType || "-"}</div>
                            <div><strong>Size:</strong> {Math.round(adminUploadFileSize / 1024)} KB</div>
                          </div>
                        ) : null}

                        {adminUploadData ? (
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => clearSelectedAdminUploadFile()}
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", borderColor: "#FCA5A5", color: "#991B1B" }}
                            >
                              <X size={14} />
                              Remove Selected File
                            </button>
                          </div>
                        ) : null}

                        {adminUploadData ? (
                          <img
                            src={adminUploadData}
                            alt="Admin selected payment document"
                            style={{
                              width: "100%",
                              maxHeight: "360px",
                              objectFit: "contain",
                              borderRadius: "12px",
                              border: "1px solid #CBD5E1",
                              background: "#F8FAFC",
                            }}
                          />
                        ) : null}

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.55rem", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => resetAdminUploadState()}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void submitAdminPaymentProofAndMarkPaid()}
                            disabled={uploadingAdminProofInvoiceId === adminUploadInvoice.id || !adminUploadData}
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", borderColor: "#86EFAC", color: "#166534" }}
                          >
                            <CheckCircle2 size={14} />
                            {uploadingAdminProofInvoiceId === adminUploadInvoice.id
                              ? "Uploading..."
                              : adminUploadInvoice.paymentStatus === "paid"
                                ? "Save Uploaded File"
                                : "Upload & Mark Paid"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {!selectedInvoice && paymentProofPreviewInvoice?.paymentProof ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Payment proof preview"
          onClick={() => setPaymentProofPreviewInvoiceId("")}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "rgba(15, 23, 42, 0.65)",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(940px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              borderRadius: "18px",
              background: "#FFFFFF",
              padding: "1rem",
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.35)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "0.9rem" }}>
              <div>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0F172A" }}>
                  {paymentProofPreviewInvoice.invoiceNumber}
                </div>
                <div style={{ color: "#475569", fontSize: "0.9rem" }}>
                  {paymentProofPreviewInvoice.customerName}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPaymentProofPreviewInvoiceId("")}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <X size={14} />
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: "0.75rem" }}>
              <div style={{ color: "#64748B", fontSize: "0.9rem" }}>
                Uploaded {formatDateTime(paymentProofPreviewInvoice.paymentProof.uploadedAt)} via {getPaymentProofMethodLabel(paymentProofPreviewInvoice.paymentProof.method)}
              </div>
              <div style={{ color: "#475569", fontSize: "0.85rem" }}>
                File: {paymentProofPreviewInvoice.paymentProof.screenshotFileName}
              </div>
              {paymentProofPreviewInvoice.paymentProof.method !== "adminUpload" &&
              paymentProofPreviewInvoice.paymentProof.relatedFiles.length > 0 ? (
                <div
                  style={{
                    border: "1px solid #BFDBFE",
                    borderRadius: "10px",
                    background: "#EFF6FF",
                    padding: "0.7rem",
                    display: "grid",
                    gap: "0.55rem",
                  }}
                >
                  <div style={{ color: "#1E3A8A", fontSize: "0.82rem", fontWeight: 700 }}>
                    Customer Related Verification Files
                  </div>
                  <div style={{ display: "grid", gap: "0.55rem" }}>
                    {paymentProofPreviewInvoice.paymentProof.relatedFiles.map((relatedFile, index) => {
                      const isImage = relatedFile.fileMimeType.startsWith("image/");
                      return (
                        <div
                          key={`${paymentProofPreviewInvoice.id}-related-dialog-${index}`}
                          style={{
                            border: "1px solid #93C5FD",
                            borderRadius: "8px",
                            background: "#FFFFFF",
                            padding: "0.5rem",
                            display: "grid",
                            gap: "0.35rem",
                          }}
                        >
                          <div style={{ color: "#1E293B", fontSize: "0.8rem", fontWeight: 700 }}>
                            {relatedFile.fileName || `Related file ${index + 1}`}
                          </div>
                          <div style={{ color: "#64748B", fontSize: "0.76rem" }}>
                            Uploaded: {formatDateTime(relatedFile.uploadedAt)}
                          </div>
                          <a
                            href={relatedFile.fileData}
                            target="_blank"
                            rel="noreferrer"
                            download={relatedFile.fileName || `related-file-${index + 1}`}
                            style={{
                              border: "1px solid #93C5FD",
                              background: "#EFF6FF",
                              color: "#1D4ED8",
                              borderRadius: "8px",
                              fontSize: "0.76rem",
                              fontWeight: 700,
                              padding: "0.3rem 0.52rem",
                              textDecoration: "none",
                              width: "fit-content",
                            }}
                          >
                            Open or Download
                          </a>
                          {isImage ? (
                            <img
                              src={relatedFile.fileData}
                              alt={relatedFile.fileName || "Customer related verification file"}
                              style={{
                                width: "min(220px, 100%)",
                                border: "1px solid #CBD5E1",
                                borderRadius: "8px",
                                background: "#F8FAFC",
                                padding: "0.2rem",
                                objectFit: "contain",
                              }}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <img
                src={paymentProofPreviewInvoice.paymentProof.screenshotData}
                alt={
                  paymentProofPreviewInvoice.paymentProof.method === "adminUpload"
                    ? "Admin uploaded payment document"
                    : "Customer uploaded payment receipt"
                }
                style={{
                  width: "100%",
                  maxHeight: "70vh",
                  objectFit: "contain",
                  borderRadius: "14px",
                  border: "1px solid #CBD5E1",
                  background: "#F8FAFC",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", flexWrap: "wrap" }}>
                {paymentProofPreviewInvoice.paymentProof.method === "adminUpload" ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setPaymentProofPreviewInvoiceId("");
                        openAdminUploadModal(paymentProofPreviewInvoice);
                      }}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#93C5FD", color: "#1D4ED8" }}
                    >
                      <FileText size={14} />
                      Edit File
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        void updateInvoicePaymentStatus(
                          paymentProofPreviewInvoice.id,
                          paymentProofPreviewInvoice.paymentStatus,
                          { clearPaymentProof: true },
                        )
                      }
                      disabled={updatingPaymentInvoiceId === paymentProofPreviewInvoice.id}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#FCA5A5", color: "#991B1B" }}
                    >
                      <X size={14} />
                      {updatingPaymentInvoiceId === paymentProofPreviewInvoice.id ? "Removing..." : "Remove File"}
                    </button>
                  </>
                ) : null}
                {canMarkInvoiceAsPaid(paymentProofPreviewInvoice) ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void updateInvoicePaymentStatus(paymentProofPreviewInvoice.id, "paid")}
                    disabled={updatingPaymentInvoiceId === paymentProofPreviewInvoice.id}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#86EFAC", color: "#166534" }}
                  >
                    <CheckCircle2 size={14} />
                    {updatingPaymentInvoiceId === paymentProofPreviewInvoice.id ? "Updating..." : "Mark as Paid"}
                  </button>
                ) : canMarkInvoiceAsUnpaid(paymentProofPreviewInvoice) ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void updateInvoicePaymentStatus(paymentProofPreviewInvoice.id, "unpaid")}
                    disabled={updatingPaymentInvoiceId === paymentProofPreviewInvoice.id}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderColor: "#FCA5A5", color: "#991B1B" }}
                  >
                    <X size={14} />
                    {updatingPaymentInvoiceId === paymentProofPreviewInvoice.id ? "Updating..." : "Mark as Unpaid"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!selectedInvoice && adminUploadInvoice ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Admin payment document upload"
          onClick={() => resetAdminUploadState()}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "rgba(15, 23, 42, 0.65)",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              borderRadius: "16px",
              background: "#FFFFFF",
              padding: "1rem",
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.35)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.7rem" }}>
              <div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0F172A" }}>
                  Upload Payment Document
                </div>
                <div style={{ fontSize: "0.88rem", color: "#475569" }}>
                  {adminUploadInvoice.invoiceNumber} - {adminUploadInvoice.customerName}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => resetAdminUploadState()}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <X size={14} />
                Close
              </button>
            </div>

            <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.75rem" }}>
              <p style={{ margin: 0, color: "#64748B", fontSize: "0.88rem" }}>
                {adminUploadHasExistingProof
                  ? "This invoice already has an admin-uploaded document. Replace it or remove it before saving."
                  : "Upload payment document (screenshot/photo). It will be stored as Admin Upload and kept separate from customer UPI/Wire receipts."}
              </p>

              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  void onAdminProofFileChange(event);
                }}
                style={{
                  border: "1px dashed #CBD5E1",
                  borderRadius: "10px",
                  padding: "0.65rem",
                  background: "#F8FAFC",
                }}
              />

              {adminUploadFileName ? (
                <div
                  style={{
                    border: "1px solid #E2E8F0",
                    borderRadius: "10px",
                    padding: "0.6rem 0.75rem",
                    background: "#F8FAFC",
                    fontSize: "0.84rem",
                    color: "#334155",
                  }}
                >
                  <div><strong>File:</strong> {adminUploadFileName}</div>
                  <div><strong>Type:</strong> {adminUploadMimeType || "-"}</div>
                  <div><strong>Size:</strong> {Math.round(adminUploadFileSize / 1024)} KB</div>
                </div>
              ) : null}

              {adminUploadData ? (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => clearSelectedAdminUploadFile()}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", borderColor: "#FCA5A5", color: "#991B1B" }}
                  >
                    <X size={14} />
                    Remove Selected File
                  </button>
                </div>
              ) : null}

              {adminUploadData ? (
                <img
                  src={adminUploadData}
                  alt="Admin selected payment document"
                  style={{
                    width: "100%",
                    maxHeight: "360px",
                    objectFit: "contain",
                    borderRadius: "12px",
                    border: "1px solid #CBD5E1",
                    background: "#F8FAFC",
                  }}
                />
              ) : null}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.55rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => resetAdminUploadState()}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void submitAdminPaymentProofAndMarkPaid()}
                  disabled={uploadingAdminProofInvoiceId === adminUploadInvoice.id || !adminUploadData}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", borderColor: "#86EFAC", color: "#166534" }}
                >
                  <CheckCircle2 size={14} />
                  {uploadingAdminProofInvoiceId === adminUploadInvoice.id
                    ? "Uploading..."
                    : adminUploadInvoice.paymentStatus === "paid"
                      ? "Save Uploaded File"
                      : "Upload & Mark Paid"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AdminPortalFrame>
  );
}
