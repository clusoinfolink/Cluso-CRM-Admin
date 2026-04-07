"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  FileText,
  ListFilter,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { getAlertTone } from "@/lib/alerts";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import { RequestItem, ServiceVerification } from "@/lib/types";

type CompanyRequestGroup = {
  key: string;
  companyName: string;
  companyEmail: string;
  items: RequestItem[];
  counts: {
    pending: number;
    approved: number;
    verified: number;
    rejected: number;
    submitted: number;
  };
};

type CompanyFilterOption = {
  label: string;
  value: string;
};

const REQUESTS_QUERY_KEY = ["admin-requests"];
const REQUESTS_STALE_TIME_MS = 5 * 60 * 1000;
const CUSTOM_VERIFICATION_MODE_STORAGE_KEY = "cluso-admin-custom-verification-modes";
const CUSTOM_VERIFICATION_MODE_SENTINEL = "__add_custom_mode__";
const DEFAULT_VERIFICATION_MODE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "document", label: "Document Check" },
  { value: "database", label: "Database Check" },
  { value: "field", label: "Field Verification" },
] as const;

const REPORT_NOTICE_PARAGRAPHS = [
  "The Cluso Report is provided by CLUSO INFOLINK, LLC. CLUSO INFOLINK, LLC does not warrant the completeness or correctness of this report or any of the information contained herein. CLUSO INFOLINK, LLC is not liable for any loss, damage or injury caused by negligence or other act or failure of CLUSO INFOLINK, LLC in procuring, collecting or communicating any such information. Reliance on any information contained herein shall be solely at the users risk and shall not constitute a waiver of any claim against, and a release of, CLUSO INFOLINK, LLC.",
  "This report is furnished in strict confidence for your exclusive use of legitimate business purposes and for no other purpose, and shall not be reproduced in whole or in part in any manner whatsoever. CLUSO INFOLINK is a private investigation company licensed by the Texas Private Security Bureau (TX License Number A16821). Contact the Texas PSB for regulatory information or complaints: TX Private Security, MSC 0241, PO Box 4087, Austin TX 78773-0001 Tel: 512-424-7298 Fax: 512-424-7728.",
] as const;

type ReportPreviewAttempt = {
  attemptedAt: string;
  status: string;
  verificationMode: string;
  comment: string;
  verifierName: string;
  managerName: string;
};

type ReportPreviewService = {
  serviceName: string;
  status: string;
  verificationMode: string;
  comment: string;
  attempts: ReportPreviewAttempt[];
};

type ReportPreviewData = {
  reportNumber: string;
  generatedAt: string;
  generatedByName: string;
  candidate: {
    name: string;
    email: string;
    phone: string;
  };
  company: {
    name: string;
    email: string;
  };
  status: string;
  createdAt: string;
  services: ReportPreviewService[];
  createdByName: string;
  verifiedByName: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function formatReportDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

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

function formatReportDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

function toReportStatusLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "-";
  }

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function toReportAttemptStatusLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "verified") {
    return "Verified";
  }

  return "In Progress";
}

function toReportModeLabel(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "Manual";
  }

  if (normalized === normalized.toLowerCase()) {
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  }

  return normalized;
}

function getReportStatusColor(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "verified") {
    return "#0A7D2A";
  }

  if (normalized === "unverified" || normalized === "rejected") {
    return "#C62828";
  }

  return "#111827";
}

function getReportAttemptStatusColor(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "verified") {
    return "#0A7D2A";
  }

  return "#A16207";
}

function parseStoredReportData(raw: unknown): Omit<ReportPreviewData, "createdByName" | "verifiedByName"> | null {
  const root = asRecord(raw);
  if (!root) {
    return null;
  }

  const candidateRecord = asRecord(root.candidate);
  const companyRecord = asRecord(root.company);

  const servicesRaw = Array.isArray(root.services) ? root.services : [];
  const services = servicesRaw
    .map((serviceEntry) => {
      const serviceRecord = asRecord(serviceEntry);
      if (!serviceRecord) {
        return null;
      }

      const attemptsRaw = Array.isArray(serviceRecord.attempts) ? serviceRecord.attempts : [];
      const attempts = attemptsRaw
        .map((attemptEntry) => {
          const attemptRecord = asRecord(attemptEntry);
          if (!attemptRecord) {
            return null;
          }

          return {
            attemptedAt: asString(attemptRecord.attemptedAt),
            status: asString(attemptRecord.status, "pending"),
            verificationMode: asString(attemptRecord.verificationMode),
            comment: asString(attemptRecord.comment),
            verifierName: asString(attemptRecord.verifierName),
            managerName: asString(attemptRecord.managerName),
          } satisfies ReportPreviewAttempt;
        })
        .filter((attempt): attempt is ReportPreviewAttempt => attempt !== null);

      return {
        serviceName: asString(serviceRecord.serviceName, "Unnamed Service"),
        status: asString(serviceRecord.status, "pending"),
        verificationMode: asString(serviceRecord.verificationMode),
        comment: asString(serviceRecord.comment),
        attempts,
      } satisfies ReportPreviewService;
    })
    .filter((service): service is ReportPreviewService => service !== null);

  return {
    reportNumber: asString(root.reportNumber),
    generatedAt: asString(root.generatedAt),
    generatedByName: asString(root.generatedByName),
    candidate: {
      name: asString(candidateRecord?.name),
      email: asString(candidateRecord?.email),
      phone: asString(candidateRecord?.phone),
    },
    company: {
      name: asString(companyRecord?.name),
      email: asString(companyRecord?.email),
    },
    status: asString(root.status, "pending"),
    createdAt: asString(root.createdAt),
    services,
  };
}

function buildReportPreviewData(item: RequestItem, viewerName: string) {
  const stored = parseStoredReportData(item.reportData);

  const fallbackServices: ReportPreviewService[] =
    item.serviceVerifications && item.serviceVerifications.length > 0
      ? item.serviceVerifications.map((service) => ({
          serviceName: service.serviceName,
          status: service.status,
          verificationMode: service.verificationMode,
          comment: service.comment,
          attempts: (service.attempts ?? []).map((attempt) => ({
            attemptedAt: attempt.attemptedAt,
            status: attempt.status,
            verificationMode: attempt.verificationMode,
            comment: attempt.comment,
            verifierName: attempt.verifierName ?? "",
            managerName: attempt.managerName ?? "",
          })),
        }))
      : (item.selectedServices ?? []).map((service) => ({
          serviceName: service.serviceName,
          status: "pending",
          verificationMode: "",
          comment: "",
          attempts: [],
        }));

  const services = stored?.services.length ? stored.services : fallbackServices;
  const latestAttempt = services
    .flatMap((service) => service.attempts)
    .slice()
    .sort(
      (first, second) =>
        new Date(second.attemptedAt || 0).getTime() - new Date(first.attemptedAt || 0).getTime(),
    )[0];

  const generatedByName =
    item.reportMetadata?.generatedByName ||
    stored?.generatedByName ||
    item.createdByName ||
    viewerName ||
    "Unknown";

  return {
    reportNumber:
      item.reportMetadata?.reportNumber ||
      stored?.reportNumber ||
      `RPT-${item._id.slice(-8).toUpperCase()}`,
    generatedAt:
      item.reportMetadata?.generatedAt || stored?.generatedAt || item.createdAt,
    generatedByName,
    candidate: {
      name: stored?.candidate.name || item.candidateName || "-",
      email: stored?.candidate.email || item.candidateEmail || "-",
      phone: stored?.candidate.phone || item.candidatePhone || "-",
    },
    company: {
      name: stored?.company.name || item.customerName || "-",
      email: stored?.company.email || item.customerEmail || "-",
    },
    status: stored?.status || item.status,
    createdAt: stored?.createdAt || item.createdAt,
    services,
    createdByName: generatedByName,
    verifiedByName:
      latestAttempt?.managerName ||
      latestAttempt?.verifierName ||
      generatedByName,
  } satisfies ReportPreviewData;
}

async function fetchRequests() {
  const reqRes = await fetch("/api/requests", { cache: "no-store" });
  if (!reqRes.ok) {
    throw new Error("Could not load requests.");
  }

  const reqJson = (await reqRes.json()) as { items: RequestItem[] };
  return reqJson.items ?? [];
}

function companyGroupKey(item: Pick<RequestItem, "customerName" | "customerEmail">) {
  const companyName = (item.customerName || "Unknown Company").trim().toLowerCase();
  const companyEmail = (item.customerEmail || "").trim().toLowerCase();
  return `${companyName}::${companyEmail}`;
}

function parseRepeatableAnswerValues(rawValue: string, repeatable?: boolean) {
  if (!repeatable) {
    return [];
  }

  const trimmedValue = rawValue.trim();
  if (!trimmedValue.startsWith("[")) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

function normalizeVerificationModeInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function loadStoredCustomVerificationModes() {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_VERIFICATION_MODE_STORAGE_KEY);
    if (!raw) {
      return [] as string[];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }

    const dedupedModes: string[] = [];
    for (const modeEntry of parsed) {
      if (typeof modeEntry !== "string") {
        continue;
      }

      const normalizedMode = normalizeVerificationModeInput(modeEntry);
      if (!normalizedMode) {
        continue;
      }

      const normalizedModeLower = normalizedMode.toLowerCase();
      const isDefault = DEFAULT_VERIFICATION_MODE_OPTIONS.some(
        (option) =>
          option.value.toLowerCase() === normalizedModeLower ||
          option.label.toLowerCase() === normalizedModeLower,
      );
      if (isDefault) {
        continue;
      }

      const alreadyAdded = dedupedModes.some(
        (existingMode) => existingMode.toLowerCase() === normalizedModeLower,
      );
      if (!alreadyAdded) {
        dedupedModes.push(normalizedMode);
      }
    }

    return dedupedModes;
  } catch {
    return [] as string[];
  }
}

function RequestsPageContent() {
  const { me, loading, logout } = useAdminSession();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const requestsQuery = useQuery<RequestItem[]>({
    queryKey: REQUESTS_QUERY_KEY,
    queryFn: fetchRequests,
    staleTime: REQUESTS_STALE_TIME_MS,
    enabled: Boolean(me),
  });

  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const canVerifyWorkflow =
    me?.role === "admin" ||
    me?.role === "superadmin" ||
    me?.role === "manager" ||
    me?.role === "verifier";
  const canGenerateReport =
    me?.role === "admin" || me?.role === "superadmin" || me?.role === "manager";
  const [searchText, setSearchText] = useState("");
  const [message, setMessage] = useState("");
  const [highlightedRequestId, setHighlightedRequestId] = useState("");
  const [activeResponseRequestId, setActiveResponseRequestId] = useState("");
  const [serviceDraftsByRequest, setServiceDraftsByRequest] = useState<
    Record<string, Record<string, { status: "verified" | "unverified"; verificationMode: string; comment: string }>>
  >({});
  const [customVerificationModes, setCustomVerificationModes] = useState<string[]>(loadStoredCustomVerificationModes);
  const [showCustomModeInputByService, setShowCustomModeInputByService] = useState<Record<string, boolean>>({});
  const [customModeInputByService, setCustomModeInputByService] = useState<Record<string, string>>({});
  const [verifyingServiceKey, setVerifyingServiceKey] = useState("");
  const [reportingRequestId, setReportingRequestId] = useState("");
  const [sharingReportRequestId, setSharingReportRequestId] = useState("");
  const [activeReportPreviewRequestId, setActiveReportPreviewRequestId] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestItem["status"]>("all");
  const [formStatusFilter, setFormStatusFilter] = useState<"all" | "submitted" | "pending">("all");
  const [expandedCompanyGroups, setExpandedCompanyGroups] = useState<Record<string, boolean>>({});

  const focusRequestId = searchParams.get("requestId")?.trim() ?? "";

  const loadRequests = useCallback(
    async (force = true) => {
      await queryClient.fetchQuery({
        queryKey: REQUESTS_QUERY_KEY,
        queryFn: fetchRequests,
        staleTime: force ? 0 : REQUESTS_STALE_TIME_MS,
      });
    },
    [queryClient],
  );

  const verificationModeOptions = useMemo(
    () => [
      ...DEFAULT_VERIFICATION_MODE_OPTIONS,
      ...customVerificationModes.map((mode) => ({ value: mode, label: mode })),
    ],
    [customVerificationModes],
  );

  function getServiceVerifications(item: RequestItem): ServiceVerification[] {
    if (item.serviceVerifications && item.serviceVerifications.length > 0) {
      return item.serviceVerifications;
    }

    return (item.selectedServices ?? []).map((service) => ({
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      status: "pending",
      verificationMode: "",
      comment: "",
      attempts: [],
    }));
  }

  function openVerificationModal(item: RequestItem) {
    setActiveReportPreviewRequestId("");
    const services = getServiceVerifications(item);

    setServiceDraftsByRequest((prev) => {
      if (prev[item._id]) {
        return prev;
      }

      const requestDraft: Record<
        string,
        { status: "verified" | "unverified"; verificationMode: string; comment: string }
      > = {};

      for (const service of services) {
        requestDraft[service.serviceId] = {
          status: service.status === "unverified" ? "unverified" : "verified",
          verificationMode: service.verificationMode || "manual",
          comment: service.comment || "",
        };
      }

      return {
        ...prev,
        [item._id]: requestDraft,
      };
    });

    setActiveResponseRequestId(item._id);
  }

  function updateServiceDraft(
    requestId: string,
    serviceId: string,
    patch: Partial<{ status: "verified" | "unverified"; verificationMode: string; comment: string }>,
  ) {
    setServiceDraftsByRequest((prev) => {
      const requestDraft = prev[requestId] ?? {};
      const existing = requestDraft[serviceId] ?? {
        status: "verified" as const,
        verificationMode: "manual",
        comment: "",
      };

      return {
        ...prev,
        [requestId]: {
          ...requestDraft,
          [serviceId]: {
            ...existing,
            ...patch,
          },
        },
      };
    });
  }

  function resolveVerificationMode(rawMode: string) {
    const normalizedInput = normalizeVerificationModeInput(rawMode);
    if (!normalizedInput) {
      return { mode: "", added: false };
    }

    const normalizedInputLower = normalizedInput.toLowerCase();
    const defaultMatch = DEFAULT_VERIFICATION_MODE_OPTIONS.find(
      (option) =>
        option.value.toLowerCase() === normalizedInputLower ||
        option.label.toLowerCase() === normalizedInputLower,
    );
    if (defaultMatch) {
      return { mode: defaultMatch.value, added: false };
    }

    const existingCustom = customVerificationModes.find(
      (mode) => mode.toLowerCase() === normalizedInputLower,
    );
    if (existingCustom) {
      return { mode: existingCustom, added: false };
    }

    const nextModes = [...customVerificationModes, normalizedInput];
    setCustomVerificationModes(nextModes);

    try {
      window.localStorage.setItem(
        CUSTOM_VERIFICATION_MODE_STORAGE_KEY,
        JSON.stringify(nextModes),
      );
    } catch {
      // Ignore storage errors; mode remains available for this session.
    }

    return { mode: normalizedInput, added: true };
  }

  function saveCustomModeForService(requestId: string, serviceId: string) {
    const serviceKey = `${requestId}:${serviceId}`;
    const rawInput = customModeInputByService[serviceKey] ?? "";
    const resolved = resolveVerificationMode(rawInput);

    if (!resolved.mode) {
      setMessage("Enter a custom verification mode before saving.");
      return;
    }

    updateServiceDraft(requestId, serviceId, { verificationMode: resolved.mode });
    setShowCustomModeInputByService((prev) => ({
      ...prev,
      [serviceKey]: false,
    }));
    setCustomModeInputByService((prev) => ({
      ...prev,
      [serviceKey]: "",
    }));
    setMessage(
      resolved.added
        ? `Saved \"${resolved.mode}\" for upcoming verification mode dropdowns.`
        : `Verification mode set to \"${resolved.mode}\".`,
    );
  }

  async function logServiceAttempt(requestId: string, serviceId: string) {
    const draft = serviceDraftsByRequest[requestId]?.[serviceId];
    if (!draft) {
      setMessage("Open View Status first to prepare verification data.");
      return;
    }

    setMessage("");
    setVerifyingServiceKey(`${requestId}:${serviceId}`);

    const res = await fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "verify-service",
        requestId,
        serviceId,
        serviceStatus: draft.status,
        verificationMode: draft.verificationMode,
        comment: draft.comment,
      }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    setVerifyingServiceKey("");

    if (!res.ok) {
      setMessage(data.error ?? "Could not log service verification attempt.");
      return;
    }

    setMessage(data.message ?? "Service verification attempt logged.");
    await loadRequests();
  }

  async function generateReport(requestId: string) {
    setMessage("");
    setReportingRequestId(requestId);

    const res = await fetch(`/api/requests/${requestId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = (await res.json()) as { message?: string; error?: string; reportNumber?: string };
    setReportingRequestId("");

    if (!res.ok) {
      setMessage(data.error ?? "Could not generate report.");
      return;
    }

    const downloadRes = await fetch(`/api/requests/${requestId}/report?download=1`, {
      method: "GET",
      cache: "no-store",
    });

    if (!downloadRes.ok) {
      let errorMessage = "Report was generated, but download failed.";

      try {
        const errorPayload = (await downloadRes.json()) as { error?: string; details?: string };
        errorMessage = errorPayload.error ?? errorPayload.details ?? errorMessage;
      } catch {
        // Ignore parse failures and use fallback message.
      }

      setMessage(errorMessage);
      return;
    }

    const reportBlob = await downloadRes.blob();
    const disposition = downloadRes.headers.get("content-disposition") ?? "";
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
    const filename = filenameMatch?.[1] ?? `verification-report-${requestId}.pdf`;

    const objectUrl = window.URL.createObjectURL(reportBlob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);

    setMessage(data.message ?? "Report generated and downloaded.");
    await loadRequests();
    setActiveReportPreviewRequestId(requestId);
  }

  async function shareReportToCustomer(requestId: string) {
    setMessage("");
    setSharingReportRequestId(requestId);

    const res = await fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "share-report-to-customer",
        requestId,
      }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    setSharingReportRequestId("");

    if (!res.ok) {
      setMessage(data.error ?? "Could not share report with customer.");
      return;
    }

    setMessage(data.message ?? "Report shared with customer portal.");
    await loadRequests();
  }

  function openReportPreview(item: RequestItem) {
    if (item.status !== "verified") {
      setMessage("Report preview is available after verification is complete.");
      return;
    }

    setActiveResponseRequestId("");
    setActiveReportPreviewRequestId(item._id);
  }

  function toggleCompanyGroup(groupKey: string) {
    setExpandedCompanyGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  }

  function clearFilters() {
    setCompanyFilter("");
    setStatusFilter("all");
    setFormStatusFilter("all");
  }

  const normalizedSearch = searchText.trim().toLowerCase();
  const normalizedCompanyFilter = companyFilter.trim().toLowerCase();

  const companyFilterOptions = useMemo<CompanyFilterOption[]>(() => {
    const optionsMap = new Map<string, CompanyFilterOption>();

    for (const item of requests) {
      const name = (item.customerName || "Unknown Company").trim();
      const email = (item.customerEmail || "").trim();
      const optionKey = companyGroupKey({ customerName: name, customerEmail: email });
      if (optionsMap.has(optionKey)) {
        continue;
      }

      optionsMap.set(optionKey, {
        label: email ? `${name} (${email})` : name,
        value: name,
      });
    }

    return [...optionsMap.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [requests]);

  const filteredRequests = useMemo(
    () =>
      requests.filter((item) => {
        if (normalizedSearch) {
          const searchable = [
            item.customerName,
            item.customerEmail,
            item.candidateName,
            item.candidateEmail,
            item.candidatePhone,
            item.status,
            item.rejectionNote,
            item.candidateFormStatus,
            (item.selectedServices ?? []).map((service) => service.serviceName).join(" "),
          ]
            .join(" ")
            .toLowerCase();

          if (!searchable.includes(normalizedSearch)) {
            return false;
          }
        }

        if (normalizedCompanyFilter) {
          const companyHaystack = `${item.customerName || ""} ${item.customerEmail || ""}`.toLowerCase();
          if (!companyHaystack.includes(normalizedCompanyFilter)) {
            return false;
          }
        }

        if (statusFilter !== "all" && item.status !== statusFilter) {
          return false;
        }

        const normalizedFormStatus = item.candidateFormStatus ?? "pending";
        if (formStatusFilter !== "all" && normalizedFormStatus !== formStatusFilter) {
          return false;
        }

        return true;
      }),
    [normalizedCompanyFilter, normalizedSearch, requests, statusFilter, formStatusFilter],
  );

  const groupedRequests = useMemo<CompanyRequestGroup[]>(() => {
    const groupedMap = new Map<string, CompanyRequestGroup>();

    for (const item of filteredRequests) {
      const key = companyGroupKey(item);
      const formSubmitted = item.candidateFormStatus === "submitted";

      const existing = groupedMap.get(key);
      if (!existing) {
        groupedMap.set(key, {
          key,
          companyName: item.customerName || "Unknown Company",
          companyEmail: item.customerEmail || "-",
          items: [item],
          counts: {
            pending: item.status === "pending" ? 1 : 0,
            approved: item.status === "approved" ? 1 : 0,
            verified: item.status === "verified" ? 1 : 0,
            rejected: item.status === "rejected" ? 1 : 0,
            submitted: formSubmitted ? 1 : 0,
          },
        });
        continue;
      }

      existing.items.push(item);
      if (item.status === "pending") {
        existing.counts.pending += 1;
      } else if (item.status === "approved") {
        existing.counts.approved += 1;
      } else if (item.status === "verified") {
        existing.counts.verified += 1;
      } else if (item.status === "rejected") {
        existing.counts.rejected += 1;
      }
      if (formSubmitted) {
        existing.counts.submitted += 1;
      }
    }

    return [...groupedMap.values()]
      .map((group) => ({
        ...group,
        items: [...group.items].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [filteredRequests]);

  useEffect(() => {
    if (!focusRequestId || requests.length === 0) {
      return;
    }

    const targetRequest = requests.find((item) => item._id === focusRequestId);
    if (!targetRequest) {
      return;
    }

    const targetGroup = companyGroupKey(targetRequest);

    const stateUpdateTimer = window.setTimeout(() => {
      setSearchText("");
      setCompanyFilter(targetRequest.customerName || "");
      setStatusFilter("all");
      setFormStatusFilter("all");
      setIsFilterOpen(true);
      setExpandedCompanyGroups((prev) => ({
        ...prev,
        [targetGroup]: true,
      }));
      setHighlightedRequestId(focusRequestId);
    }, 0);

    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`request-${focusRequestId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);

    return () => {
      window.clearTimeout(stateUpdateTimer);
      window.clearTimeout(scrollTimer);
    };
  }, [focusRequestId, requests]);

  const activeResponseRequest = useMemo(
    () => requests.find((item) => item._id === activeResponseRequestId) ?? null,
    [activeResponseRequestId, requests],
  );

  const activeReportPreviewRequest = useMemo(
    () => requests.find((item) => item._id === activeReportPreviewRequestId) ?? null,
    [activeReportPreviewRequestId, requests],
  );

  function renderResponseContent(item: RequestItem) {
    if (!item.candidateFormResponses || item.candidateFormResponses.length === 0) {
      return <p style={{ margin: 0, color: "#667892" }}>Candidate has not submitted form responses yet.</p>;
    }

    return (
      <div style={{ display: "grid", gap: "1rem" }}>
        {item.candidateFormResponses.map((serviceResponse) => (
          <div
            key={`${item._id}-${serviceResponse.serviceId}`}
            style={{
              border: "1px solid #E2E8F0",
              borderRadius: "12px",
              padding: "1rem",
              background: "#F8FAFC",
            }}
          >
            <h4 style={{ margin: 0, color: "#1E293B", fontSize: "1.05rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <BadgeCheck size={18} color="#3B82F6" />
              {serviceResponse.serviceName}
            </h4>
            <div style={{ marginTop: "0.75rem" }}>
              {serviceResponse.answers.length === 0 ? (
                <span style={{ color: "#64748B", fontSize: "0.9rem" }}>No answers available.</span>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: "640px", borderCollapse: "collapse", background: "#FFFFFF", borderRadius: "8px", overflow: "hidden", border: "1px solid #E2E8F0" }}>
                    <thead>
                      <tr style={{ background: "#F1F5F9", textAlign: "left" }}>
                        <th style={{ padding: "0.75rem 1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0", width: "40%" }}>Information Required</th>
                        <th style={{ padding: "0.75rem 1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0" }}>Provided Response</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceResponse.answers.map((answer, answerIndex) => {
                        const repeatableValues = parseRepeatableAnswerValues(answer.value, answer.repeatable);

                        return (
                          <tr key={`${serviceResponse.serviceId}-${answerIndex}`}>
                            <td style={{ padding: "0.75rem 1rem", color: "#334155", fontSize: "0.9rem", fontWeight: 500, borderBottom: answerIndex === serviceResponse.answers.length - 1 ? "none" : "1px solid #F1F5F9", verticalAlign: "top" }}>
                              {answer.question}
                            </td>
                            <td style={{ padding: "0.75rem 1rem", color: "#1E293B", fontSize: "0.9rem", borderBottom: answerIndex === serviceResponse.answers.length - 1 ? "none" : "1px solid #F1F5F9" }}>
                              {answer.fieldType === "file" && answer.fileData ? (
                                <span style={{ display: "inline-flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", background: "#EFF6FF", padding: "0.25rem 0.75rem", borderRadius: "8px", border: "1px solid #BFDBFE" }}>
                                  <span style={{ fontWeight: 600, color: "#1D4ED8", fontSize: "0.85rem" }}>
                                    {answer.fileName || "Attachment"}
                                  </span>
                                  <div style={{ width: "1px", height: "14px", background: "#93C5FD" }} />
                                  <a
                                    href={answer.fileData}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: "#2563EB", textDecoration: "none", fontSize: "0.85rem", fontWeight: 500 }}
                                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                  >
                                    View File
                                  </a>
                                  <a
                                    href={answer.fileData}
                                    download={answer.fileName || `attachment-${answerIndex}`}
                                    style={{ color: "#2563EB", textDecoration: "none", fontSize: "0.85rem", fontWeight: 500 }}
                                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                  >
                                    Download
                                  </a>
                                </span>
                              ) : repeatableValues.length > 0 ? (
                                <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "grid", gap: "0.25rem" }}>
                                  {repeatableValues.map((entry, entryIndex) => (
                                    <li key={`${serviceResponse.serviceId}-${answerIndex}-entry-${entryIndex}`} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                      {entry}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                answer.value || <span style={{ color: "#94A3B8", fontStyle: "italic" }}>Not provided</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderServiceVerificationWorkspace(item: RequestItem) {
    const services = getServiceVerifications(item);
    const requestDraft = serviceDraftsByRequest[item._id] ?? {};

    if (services.length === 0) {
      return (
        <div className="glass-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
          <p style={{ margin: 0, color: "#667892" }}>No services are attached to this request.</p>
        </div>
      );
    }

    return (
      <div className="glass-card" style={{ padding: "1rem", marginBottom: "1rem", background: "#F8FAFC" }}>
        <h4 style={{ margin: "0 0 0.4rem", color: "#1E293B" }}>Service Verification Workspace</h4>
        <p style={{ margin: "0 0 0.85rem", color: "#64748B", fontSize: "0.85rem" }}>
          Log verification attempts per service with result, mode, and comments.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "920px", borderCollapse: "collapse", background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "8px" }}>
            <thead>
              <tr style={{ background: "#F1F5F9", textAlign: "left" }}>
                <th style={{ padding: "0.65rem", fontSize: "0.8rem", color: "#475569" }}>Service</th>
                <th style={{ padding: "0.65rem", fontSize: "0.8rem", color: "#475569" }}>Current Status</th>
                <th style={{ padding: "0.65rem", fontSize: "0.8rem", color: "#475569" }}>Verification Mode</th>
                <th style={{ padding: "0.65rem", fontSize: "0.8rem", color: "#475569" }}>Result</th>
                <th style={{ padding: "0.65rem", fontSize: "0.8rem", color: "#475569" }}>Comment</th>
                <th style={{ padding: "0.65rem", fontSize: "0.8rem", color: "#475569" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => {
                const draft = requestDraft[service.serviceId] ?? {
                  status: service.status === "unverified" ? "unverified" : "verified",
                  verificationMode: service.verificationMode || "manual",
                  comment: service.comment || "",
                };
                const serviceKey = `${item._id}:${service.serviceId}`;
                const showCustomModeInput = Boolean(showCustomModeInputByService[serviceKey]);
                const customModeInput = customModeInputByService[serviceKey] ?? "";
                const hasDraftModeOption = verificationModeOptions.some(
                  (option) => option.value === draft.verificationMode,
                );
                const rowModeOptions = hasDraftModeOption
                  ? verificationModeOptions
                  : draft.verificationMode
                    ? [
                        ...verificationModeOptions,
                        {
                          value: draft.verificationMode,
                          label: draft.verificationMode,
                        },
                      ]
                    : verificationModeOptions;
                const canSubmitAttempt =
                  canVerifyWorkflow &&
                  item.candidateFormStatus === "submitted" &&
                  (item.status === "approved" || item.status === "verified");

                return (
                  <tr key={`${item._id}-${service.serviceId}`} style={{ borderTop: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "0.65rem", fontWeight: 600, color: "#1E293B" }}>{service.serviceName}</td>
                    <td style={{ padding: "0.65rem" }}>
                      <span className={`status-pill status-pill-${service.status === "unverified" ? "rejected" : service.status === "verified" ? "verified" : "pending"}`} style={{ textTransform: "capitalize" }}>
                        {service.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.65rem", minWidth: "240px" }}>
                      <select
                        className="input"
                        style={{ minWidth: "160px", padding: "0.35rem 0.45rem" }}
                        value={draft.verificationMode}
                        onChange={(e) => {
                          const selectedMode = e.target.value;
                          if (selectedMode === CUSTOM_VERIFICATION_MODE_SENTINEL) {
                            setShowCustomModeInputByService((prev) => ({
                              ...prev,
                              [serviceKey]: true,
                            }));
                            return;
                          }

                          setShowCustomModeInputByService((prev) => ({
                            ...prev,
                            [serviceKey]: false,
                          }));
                          updateServiceDraft(item._id, service.serviceId, {
                            verificationMode: selectedMode,
                          });
                        }}
                      >
                        {rowModeOptions.map((option) => (
                          <option key={`${serviceKey}-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                        <option value={CUSTOM_VERIFICATION_MODE_SENTINEL}>+ Add custom mode</option>
                      </select>

                      {showCustomModeInput ? (
                        <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            className="input"
                            style={{ minWidth: "150px", padding: "0.32rem 0.45rem" }}
                            value={customModeInput}
                            placeholder="Type custom mode"
                            onChange={(e) =>
                              setCustomModeInputByService((prev) => ({
                                ...prev,
                                [serviceKey]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                saveCustomModeForService(item._id, service.serviceId);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: "0.3rem 0.55rem", fontSize: "0.75rem" }}
                            onClick={() => saveCustomModeForService(item._id, service.serviceId)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: "0.3rem 0.55rem", fontSize: "0.75rem" }}
                            onClick={() => {
                              setShowCustomModeInputByService((prev) => ({
                                ...prev,
                                [serviceKey]: false,
                              }));
                              setCustomModeInputByService((prev) => ({
                                ...prev,
                                [serviceKey]: "",
                              }));
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: "0.65rem" }}>
                      <select
                        className="input"
                        style={{ minWidth: "130px", padding: "0.35rem 0.45rem" }}
                        value={draft.status}
                        onChange={(e) =>
                          updateServiceDraft(item._id, service.serviceId, {
                            status: e.target.value as "verified" | "unverified",
                          })
                        }
                      >
                        <option value="verified">Verified</option>
                        <option value="unverified">Unverified</option>
                      </select>
                    </td>
                    <td style={{ padding: "0.65rem", minWidth: "210px" }}>
                      <input
                        className="input"
                        style={{ padding: "0.35rem 0.45rem" }}
                        value={draft.comment}
                        placeholder="Add attempt comment"
                        onChange={(e) =>
                          updateServiceDraft(item._id, service.serviceId, {
                            comment: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td style={{ padding: "0.65rem" }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: "0.35rem 0.6rem", fontSize: "0.78rem" }}
                        disabled={!canSubmitAttempt || verifyingServiceKey === serviceKey}
                        onClick={() => logServiceAttempt(item._id, service.serviceId)}
                      >
                        {verifyingServiceKey === serviceKey ? "Saving..." : "Log Attempt"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gap: "0.85rem", marginTop: "0.9rem" }}>
          {services.map((service) => (
            <div key={`${item._id}-${service.serviceId}-attempts`} style={{ border: "1px solid #E2E8F0", borderRadius: "8px", background: "#FFFFFF", padding: "0.75rem" }}>
              <div style={{ fontWeight: 600, color: "#334155", marginBottom: "0.45rem" }}>
                Attempts: {service.serviceName}
              </div>
              {service.attempts.length === 0 ? (
                <span style={{ color: "#64748B", fontSize: "0.82rem" }}>No attempts logged yet.</span>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid #E2E8F0" }}>
                        <th style={{ padding: "0.45rem", fontSize: "0.75rem", color: "#64748B" }}>Date/Time</th>
                        <th style={{ padding: "0.45rem", fontSize: "0.75rem", color: "#64748B" }}>Result</th>
                        <th style={{ padding: "0.45rem", fontSize: "0.75rem", color: "#64748B" }}>Mode</th>
                        <th style={{ padding: "0.45rem", fontSize: "0.75rem", color: "#64748B" }}>Comment</th>
                        <th style={{ padding: "0.45rem", fontSize: "0.75rem", color: "#64748B" }}>Verifier</th>
                        <th style={{ padding: "0.45rem", fontSize: "0.75rem", color: "#64748B" }}>Manager</th>
                      </tr>
                    </thead>
                    <tbody>
                      {service.attempts
                        .slice()
                        .reverse()
                        .map((attempt, attemptIndex) => (
                          <tr key={`${item._id}-${service.serviceId}-attempt-${attemptIndex}`} style={{ borderBottom: "1px solid #F1F5F9" }}>
                            <td style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#334155" }}>
                              {new Date(attempt.attemptedAt).toLocaleString()}
                            </td>
                            <td style={{ padding: "0.45rem", fontSize: "0.8rem", color: getReportAttemptStatusColor(attempt.status), fontWeight: 700 }}>
                              {toReportAttemptStatusLabel(attempt.status)}
                            </td>
                            <td style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#334155" }}>
                              {attempt.verificationMode || "-"}
                            </td>
                            <td style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#334155" }}>
                              {attempt.comment || "-"}
                            </td>
                            <td style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#334155" }}>
                              {attempt.verifierName || "-"}
                            </td>
                            <td style={{ padding: "0.45rem", fontSize: "0.8rem", color: "#334155" }}>
                              {attempt.managerName || "-"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderReportPreview(item: RequestItem) {
    const report = buildReportPreviewData(item, me?.name ?? "Unknown");

    return (
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
              padding: "2.4rem 2.7rem 1.6rem",
              color: "#111111",
              fontFamily: '"Times New Roman", Georgia, serif',
            }}
          >
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "2rem" }}>
              <div
                style={{
                  width: "200px",
                  height: "170px",
                  border: "1px solid #8A8A8A",
                  background: "#F4F4F4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <img
                  src="/images/cluso-infolink-logo.png"
                  alt="Cluso Infolink"
                  style={{ width: "88%", height: "88%", objectFit: "contain" }}
                />
              </div>

              <div style={{ color: "#5A5A5A", fontSize: "1.05rem", lineHeight: 1.45, textAlign: "right", marginTop: "3.4rem" }}>
                <div>
                  <span style={{ fontWeight: 700, color: "#474747" }}>Report #:</span> {report.reportNumber}
                </div>
                <div>
                  <span style={{ fontWeight: 700, color: "#474747" }}>Date:</span> {formatReportDate(report.generatedAt)}
                </div>
              </div>
            </header>

            <h2
              style={{
                textAlign: "center",
                margin: "2.1rem 0 0.85rem",
                color: "#1F4597",
                fontWeight: 700,
                fontSize: "3.15rem",
                lineHeight: 1.1,
              }}
            >
              Verification Report
            </h2>

            <section
              style={{
                border: "1px solid #D1D1D1",
                borderRadius: "6px",
                padding: "0.8rem 1.05rem",
                background: "rgba(255,255,255,0.43)",
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                columnGap: "1.3rem",
                rowGap: "0.25rem",
                fontSize: "1.03rem",
              }}
            >
              <div>
                <div>
                  <strong>Report Number:</strong> {report.reportNumber}
                </div>
                <div>
                  <strong>Request Created:</strong> {formatReportDateTime(report.createdAt)}
                </div>
                <div>
                  <strong>Overall Status:</strong>{" "}
                  <span style={{ color: getReportStatusColor(report.status), fontWeight: 700 }}>
                    {toReportStatusLabel(report.status)}
                  </span>
                </div>
              </div>
              <div>
                <div>
                  <strong>Generated At:</strong> {formatReportDateTime(report.generatedAt)}
                </div>
                <div>
                  <strong>Generated By:</strong> {report.generatedByName || "-"}
                </div>
              </div>
            </section>

            <section
              style={{
                marginTop: "1.45rem",
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "2.2rem",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "#1F4597", fontSize: "1.65rem", fontWeight: 700 }}>Candidate Details</h3>
                <p style={{ margin: "0.65rem 0 0", fontSize: "1.14rem", lineHeight: 1.4 }}>
                  <strong>Name:</strong> {report.candidate.name || "-"}
                  <br />
                  <strong>Email:</strong> {report.candidate.email || "-"}
                  <br />
                  <strong>Phone:</strong> {report.candidate.phone || "-"}
                </p>
              </div>

              <div>
                <h3 style={{ margin: 0, color: "#1F4597", fontSize: "1.65rem", fontWeight: 700 }}>Company Details</h3>
                <p style={{ margin: "0.65rem 0 0", fontSize: "1.14rem", lineHeight: 1.4 }}>
                  <strong>Company:</strong> {report.company.name || "-"}
                  <br />
                  <strong>Email:</strong> {report.company.email || "-"}
                </p>
              </div>
            </section>

            <div style={{ borderTop: "1px solid #717171", marginTop: "1.1rem" }} />

            <section style={{ marginTop: "1.35rem" }}>
              <h3 style={{ margin: 0, color: "#1F4597", fontSize: "2.05rem", fontWeight: 700 }}>
                Service Verification Summary
              </h3>

              <div style={{ marginTop: "0.75rem", display: "grid", gap: "1rem" }}>
                {report.services.map((service, serviceIndex) => {
                  const attempts = service.attempts
                    .slice()
                    .sort(
                      (first, second) =>
                        new Date(second.attemptedAt || 0).getTime() -
                        new Date(first.attemptedAt || 0).getTime(),
                    );

                  return (
                    <section key={`${item._id}-preview-service-${serviceIndex}`}>
                      <h4 style={{ margin: 0, fontWeight: 700, fontSize: "1.4rem" }}>
                        {serviceIndex + 1}. {service.serviceName}
                      </h4>
                      <p style={{ margin: "0.4rem 0 0", fontSize: "1.08rem", lineHeight: 1.35 }}>
                        <strong>Final Status:</strong>{" "}
                        <span style={{ color: getReportStatusColor(service.status), fontWeight: 700 }}>
                          {toReportStatusLabel(service.status)}
                        </span>
                        <span style={{ marginLeft: "1.7rem" }}>
                          <strong>Mode:</strong> {toReportModeLabel(service.verificationMode)}
                        </span>
                      </p>
                      {service.comment?.trim() ? (
                        <p style={{ margin: "0.15rem 0 0", fontSize: "1.08rem" }}>
                          <strong>Comment:</strong> {service.comment}
                        </p>
                      ) : null}

                      <div style={{ overflowX: "auto", marginTop: "0.42rem" }}>
                        <table style={{ width: "100%", minWidth: "690px", borderCollapse: "collapse", fontSize: "0.98rem" }}>
                          <thead>
                            <tr style={{ borderTop: "1px solid #232323", borderBottom: "1px solid #666666", textAlign: "left" }}>
                              <th style={{ padding: "0.3rem 0.2rem", width: "24%" }}>Date & Time</th>
                              <th style={{ padding: "0.3rem 0.2rem", width: "12%" }}>Status</th>
                              <th style={{ padding: "0.3rem 0.2rem", width: "10%" }}>Mode</th>
                              <th style={{ padding: "0.3rem 0.2rem" }}>Attempt Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {attempts.length === 0 ? (
                              <tr style={{ borderBottom: "1px solid #666666" }}>
                                <td colSpan={4} style={{ padding: "0.5rem 0.2rem", color: "#4B5563", fontStyle: "italic" }}>
                                  No verification attempts logged for this service.
                                </td>
                              </tr>
                            ) : (
                              attempts.map((attempt, attemptIndex) => (
                                <tr key={`${item._id}-preview-service-${serviceIndex}-attempt-${attemptIndex}`} style={{ borderBottom: "1px solid #666666", verticalAlign: "top" }}>
                                  <td style={{ padding: "0.35rem 0.2rem" }}>{formatReportDateTime(attempt.attemptedAt)}</td>
                                  <td style={{ padding: "0.35rem 0.2rem", color: getReportAttemptStatusColor(attempt.status), fontWeight: 700 }}>
                                    {toReportAttemptStatusLabel(attempt.status)}
                                  </td>
                                  <td style={{ padding: "0.35rem 0.2rem" }}>{toReportModeLabel(attempt.verificationMode)}</td>
                                  <td style={{ padding: "0.35rem 0.2rem", lineHeight: 1.35 }}>
                                    <div><strong>Verifier:</strong> {attempt.verifierName || "-"}</div>
                                    <div><strong>Manager:</strong> {attempt.managerName || "-"}</div>
                                    {attempt.comment ? <div><strong>Note:</strong> {attempt.comment}</div> : null}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>

            <section style={{ marginTop: "1.6rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1.2rem", fontSize: "1.1rem" }}>
              <div>
                <div style={{ fontWeight: 700 }}>Created By:</div>
                <div>{report.createdByName || "-"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700 }}>Verified By:</div>
                <div>{report.verifiedByName || "-"}</div>
              </div>
            </section>

            <section
              style={{
                marginTop: "1.4rem",
                border: "1px solid #777777",
                padding: "0.88rem 0.95rem",
                fontSize: "0.84rem",
                lineHeight: 1.35,
              }}
            >
              <p style={{ margin: 0, fontWeight: 700 }}>--END OF REPORT--</p>
              <p style={{ margin: "0.25rem 0 0", fontWeight: 700 }}>IMPORTANT NOTICE</p>
              {REPORT_NOTICE_PARAGRAPHS.map((paragraph) => (
                <p key={`${item._id}-${paragraph.slice(0, 20)}`} style={{ margin: "0.38rem 0 0" }}>
                  {paragraph}
                </p>
              ))}

              <div style={{ borderTop: "1px solid #777777", marginTop: "0.66rem", paddingTop: "0.5rem" }}>
                <p style={{ margin: 0, fontWeight: 700 }}>QUESTIONS?</p>
                <p style={{ margin: "0.2rem 0 0" }}>
                  If you have any questions about this report, please feel free to contact us:
                </p>
                <p style={{ margin: "0.2rem 0 0" }}>
                  Toll Free: 866-685-5177&nbsp;&nbsp;&nbsp;&nbsp;Tel: 817-945-2289&nbsp;&nbsp;&nbsp;&nbsp;Fax: 817-945-2297&nbsp;&nbsp;&nbsp;&nbsp;Email: support@cluso.in
                </p>
              </div>

              <p style={{ margin: "0.45rem 0 0", fontSize: "0.72rem", textAlign: "right" }}>Rev 3.2 (15322)</p>
            </section>

            <p style={{ margin: "1rem 0 0", textAlign: "center", color: "#555555", fontSize: "1.15rem" }}>
              Generated Report By ClusoInfolink
            </p>
          </div>
        </article>
      </div>
    );
  }

  function renderCompanyGroup(group: CompanyRequestGroup, companyIndex: number) {
    const isExpanded = Boolean(expandedCompanyGroups[group.key]);
    const isCollapsed = !isExpanded;

    return (
      <section key={group.key} className="glass-card" style={{ padding: "1.25rem", marginTop: companyIndex === 0 ? 0 : "1.5rem", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.03)" }}>
        <button
          type="button"
          onClick={() => toggleCompanyGroup(group.key)}
          className="request-panel-header"
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.companyName}`}
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", rowGap: "0.7rem", background: "transparent", border: "none", cursor: "pointer", padding: "0.5rem 0" }}
        >
          <div style={{ display: "grid", gap: "0.3rem", textAlign: "left" }}>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "1.1rem", color: "#1E293B", fontWeight: 600 }}>
              <ListFilter size={20} color="#3B82F6" />
              {group.companyName}
              <span style={{ fontSize: "0.8rem", background: "#EFF6FF", color: "#2563EB", padding: "0.15rem 0.6rem", borderRadius: "999px" }}>
                {group.items.length} requests
              </span>
            </h3>
            <span style={{ color: "#64748B", fontSize: "0.85rem" }}>{group.companyEmail || "No email provided"}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {group.counts.pending > 0 && <span className="status-pill status-pill-pending" style={{ fontSize: "0.75rem" }}>Pending: {group.counts.pending}</span>}
              {group.counts.approved > 0 && <span className="status-pill status-pill-approved" style={{ fontSize: "0.75rem" }}>Approved: {group.counts.approved}</span>}
              {group.counts.verified > 0 && <span className="status-pill status-pill-verified" style={{ fontSize: "0.75rem" }}>Verified: {group.counts.verified}</span>}
              {group.counts.rejected > 0 && <span className="status-pill status-pill-rejected" style={{ fontSize: "0.75rem" }}>Rejected: {group.counts.rejected}</span>}
              {group.counts.submitted > 0 && <span style={{ padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, color: "#1E40AF", background: "#DBEAFE" }}>Forms: {group.counts.submitted}</span>}
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", color: "#94A3B8" }}>
              {isCollapsed ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
            </span>
          </div>
        </button>

        {!isCollapsed ? (
          <div style={{ overflowX: "auto", marginTop: "1.25rem" }}>
            <table style={{ width: "100%", minWidth: "1024px", borderCollapse: "separate", borderSpacing: "0", borderRadius: "8px", overflow: "hidden", border: "1px solid #E2E8F0" }}>
              <thead style={{ background: "#F8FAFC" }}>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0" }}>Candidate</th>
                  <th style={{ padding: "1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0" }}>Contact</th>
                  <th style={{ padding: "1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0" }}>Verifier Activity</th>
                  <th style={{ padding: "1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0" }}>Services</th>
                  <th style={{ padding: "1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0" }}>Form Status</th>
                  <th style={{ padding: "1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0" }}>Validation</th>
                  <th style={{ padding: "1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0" }}>Note</th>
                  <th style={{ padding: "1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0" }}>Date</th>
                  <th style={{ padding: "1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0" }}>View Status</th>
                  <th style={{ padding: "1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item, index) => {
                  const formSubmitted = item.candidateFormStatus === "submitted";
                  const canViewStatus = canVerifyWorkflow;
                  const canVerifyNow =
                    canVerifyWorkflow &&
                    formSubmitted &&
                    (item.status === "approved" || item.status === "verified");
                  const canGenerateItemReport =
                    Boolean(canGenerateReport) && item.status === "verified";
                  const canShareItemReport =
                    Boolean(canGenerateReport) &&
                    item.status === "verified" &&
                    Boolean(item.reportData);
                  const hasSharedReportWithCustomer =
                    Boolean(item.reportMetadata?.customerSharedAt);
                  const canPreviewItemReport =
                    Boolean(canViewStatus) && item.status === "verified";
                  const verifierActivity =
                    item.verifierNames && item.verifierNames.length > 0
                      ? item.verifierNames.join(", ")
                      : "No verifier assigned";

                  return (
                    <tr
                      key={`${group.key}-${item._id}`}
                      id={`request-${item._id}`}
                      style={{
                        background: highlightedRequestId === item._id ? "#EFF6FF" : index % 2 === 1 ? "#F8FAFC" : "#FFFFFF",
                        transition: "background-color 0.2s ease"
                      }}
                      onMouseEnter={(e) => { if (highlightedRequestId !== item._id) e.currentTarget.style.background = "#F1F5F9"; }}
                      onMouseLeave={(e) => { if (highlightedRequestId !== item._id) e.currentTarget.style.background = index % 2 === 1 ? "#F8FAFC" : "#FFFFFF"; }}
                    >
                      <td style={{ padding: "1rem", fontWeight: 600, color: "#1E293B", borderBottom: "1px solid #F1F5F9" }}>
                        {item.candidateName}
                      </td>
                      <td style={{ padding: "1rem", borderBottom: "1px solid #F1F5F9" }}>
                        <div style={{ color: "#334155", fontSize: "0.9rem" }}>{item.candidateEmail || "-"}</div>
                        <div style={{ fontSize: "0.8rem", color: "#64748B", marginTop: "0.2rem" }}>{item.candidatePhone || "-"}</div>
                      </td>
                      <td style={{ padding: "1rem", maxWidth: "220px", borderBottom: "1px solid #F1F5F9", color: "#475569", fontSize: "0.85rem" }}>
                        {verifierActivity}
                      </td>
                      <td style={{ padding: "1rem", maxWidth: "260px", borderBottom: "1px solid #F1F5F9" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                          {item.selectedServices && item.selectedServices.length > 0
                            ? item.selectedServices.map((service, serviceIndex) => (
                                <span
                                  key={serviceIndex}
                                  style={{
                                    display: "inline-flex",
                                    background: "#F1F5F9",
                                    border: "1px solid #E2E8F0",
                                    color: "#475569",
                                    fontSize: "0.75rem",
                                    padding: "0.15rem 0.5rem",
                                    borderRadius: "0.375rem",
                                  }}
                                >
                                  {service.serviceName}
                                </span>
                              ))
                            : <span style={{ color: "#94A3B8" }}>-</span>}
                        </div>
                      </td>
                      <td style={{ padding: "1rem", borderBottom: "1px solid #F1F5F9" }}>
                        <div style={{ fontWeight: 600, color: formSubmitted ? "#059669" : "#D97706", fontSize: "0.9rem" }}>
                          {formSubmitted ? "Submitted" : "Pending"}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#64748B", marginTop: "0.2rem" }}>
                          {item.candidateSubmittedAt ? new Date(item.candidateSubmittedAt).toLocaleDateString() : "-"}
                        </div>
                      </td>
                      <td style={{ padding: "1rem", borderBottom: "1px solid #F1F5F9" }}>
                        <span className={`status-pill status-pill-${item.status}`} style={{ textTransform: "capitalize" }}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: "1rem", maxWidth: "220px", borderBottom: "1px solid #F1F5F9", color: "#475569", fontSize: "0.85rem" }}>
                        {item.rejectionNote || <span style={{ color: "#CBD5E1" }}>-</span>}
                      </td>
                      <td style={{ padding: "1rem", whiteSpace: "nowrap", borderBottom: "1px solid #F1F5F9", color: "#475569", fontSize: "0.85rem" }}>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "1rem", borderBottom: "1px solid #F1F5F9" }}>
                        <button
                          type="button"
                          onClick={() => openVerificationModal(item)}
                          disabled={!canViewStatus}
                          style={{
                            background: canViewStatus ? "#EFF6FF" : "#F1F5F9",
                            color: canViewStatus ? "#2563EB" : "#94A3B8",
                            border: "none",
                            padding: "0.4rem 0.8rem",
                            borderRadius: "6px",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            cursor: canViewStatus ? "pointer" : "not-allowed",
                            transition: "background 0.2s"
                          }}
                        >
                          {canViewStatus ? "View Status" : "Unavailable"}
                        </button>
                      </td>
                      <td style={{ padding: "1rem", borderBottom: "1px solid #F1F5F9", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {canVerifyWorkflow ? (
                            <button
                              type="button"
                              onClick={() => openVerificationModal(item)}
                              disabled={!canVerifyNow}
                              title={canVerifyNow ? "Verify now" : "Only approved, submitted requests can be verified"}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 500, fontSize: "0.85rem",
                                background: canVerifyNow ? "#EFF6FF" : "transparent", border: canVerifyNow ? "1px solid #BFDBFE" : "1px solid transparent", borderRadius: "6px", cursor: canVerifyNow ? "pointer" : "not-allowed",
                                color: canVerifyNow ? "#2563EB" : "#CBD5E1", padding: "0.3rem 0.6rem", transition: "all 0.2s"
                              }}
                            >
                              <BadgeCheck size={16} /> Verify Now
                            </button>
                          ) : null}

                          {canGenerateReport ? (
                            <button
                              type="button"
                              onClick={() => generateReport(item._id)}
                              disabled={!canGenerateItemReport || reportingRequestId === item._id}
                              title={
                                canGenerateItemReport
                                  ? "Generate report"
                                  : "Report is available after verification is complete"
                              }
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 500, fontSize: "0.85rem",
                                background: canGenerateItemReport ? "#F0FDF4" : "transparent", border: canGenerateItemReport ? "1px solid #BBF7D0" : "1px solid transparent", borderRadius: "6px", cursor: canGenerateItemReport ? "pointer" : "not-allowed",
                                color: canGenerateItemReport ? "#16A34A" : "#CBD5E1", padding: "0.3rem 0.6rem", transition: "all 0.2s"
                              }}
                            >
                              {reportingRequestId === item._id ? "Generating..." : "Generate Report"}
                            </button>
                          ) : null}

                          {canGenerateReport ? (
                            <button
                              type="button"
                              onClick={() => shareReportToCustomer(item._id)}
                              disabled={!canShareItemReport || sharingReportRequestId === item._id}
                              title={
                                canShareItemReport
                                  ? "Send generated report to customer portal"
                                  : "Generate report before sending it to customer"
                              }
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 500, fontSize: "0.85rem",
                                background: canShareItemReport ? "#E0F2FE" : "transparent", border: canShareItemReport ? "1px solid #BAE6FD" : "1px solid transparent", borderRadius: "6px", cursor: canShareItemReport ? "pointer" : "not-allowed",
                                color: canShareItemReport ? "#0369A1" : "#CBD5E1", padding: "0.3rem 0.6rem", transition: "all 0.2s"
                              }}
                            >
                              {sharingReportRequestId === item._id
                                ? "Sending..."
                                : hasSharedReportWithCustomer
                                  ? "Sent To Customer"
                                  : "Send To Customer"}
                            </button>
                          ) : null}

                          {canViewStatus ? (
                            <button
                              type="button"
                              onClick={() => openReportPreview(item)}
                              disabled={!canPreviewItemReport}
                              title={
                                canPreviewItemReport
                                  ? "Preview generated report layout"
                                  : "Report preview is available after verification is complete"
                              }
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 500, fontSize: "0.85rem",
                                background: canPreviewItemReport ? "#FFFBEB" : "transparent", border: canPreviewItemReport ? "1px solid #FDE68A" : "1px solid transparent", borderRadius: "6px", cursor: canPreviewItemReport ? "pointer" : "not-allowed",
                                color: canPreviewItemReport ? "#B45309" : "#CBD5E1", padding: "0.3rem 0.6rem", transition: "all 0.2s"
                              }}
                            >
                              <FileText size={16} /> Preview Report
                            </button>
                          ) : null}

                          {!canVerifyWorkflow && !canGenerateReport ? <span style={{ color: "#CBD5E1" }}>-</span> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    );
  }

  if (loading || !me || requestsQuery.isLoading) {
    return <main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>;
  }

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Verification Requests"
      subtitle={
        me.role === "manager"
          ? "Manage requests across manager-assigned companies and subordinate verifier companies."
          : "View, track, and manage verification tasks"
      }
    >
      {message ? <p className={`inline-alert ${getAlertTone(message)}`}>{message}</p> : null}

      <section className="glass-card" style={{ padding: "1.5rem", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.03)", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
          <div>
            <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "1.4rem", color: "#1E293B" }}>
              <ListFilter size={24} color="#3B82F6" />
              Company Requests Hub
            </h2>
            <p style={{ color: "#64748B", margin: "0.4rem 0 0", fontSize: "0.95rem" }}>
              Unified dashboard for service-level verification, status tracking, and report generation.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div className="search-input-wrap" style={{ flex: "1 1 340px", minWidth: 0 }}>
            <span className="search-input-icon" aria-hidden="true" style={{ marginTop: "0.15rem", color: "#94A3B8" }}>
              <Search size={18} />
            </span>
            <input
              className="input"
              style={{ borderRadius: "8px", border: "1px solid #E2E8F0", paddingLeft: "2.5rem", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)" }}
              placeholder="Search candidate, email, phone, service, status..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 1rem", borderRadius: "8px", background: isFilterOpen ? "#EFF6FF" : "#F8FAFC", color: isFilterOpen ? "#2563EB" : "#475569", border: "1px solid", borderColor: isFilterOpen ? "#BFDBFE" : "#E2E8F0", transition: "all 0.2s" }}
          >
            <SlidersHorizontal size={18} />
            {isFilterOpen ? "Active Filters" : "Filter"}
          </button>
        </div>

        {isFilterOpen && (
          <div
            style={{
              padding: "1.25rem",
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: "12px",
              display: "grid",
              gap: "1.25rem",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: "1.5rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <div style={{ display: "grid", gap: "0.5rem" }}>
                  <label htmlFor="company-select-input" style={{ fontWeight: 600, color: "#334155", fontSize: "0.85rem" }}>Company Filter</label>
                  <input
                    id="company-select-input"
                    list="company-filter-list"
                    className="input"
                    style={{ borderRadius: "8px" }}
                    placeholder="Type or select a company..."
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                  />
                  <datalist id="company-filter-list">
                    {companyFilterOptions.map((option) => (
                      <option key={`${option.value}-${option.label}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </datalist>                  </div>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <label style={{ fontWeight: 600, color: "#334155", fontSize: "0.85rem" }}>Workflow Status</label>
                <select
                  className="input"
                  style={{ borderRadius: "8px" }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as "all" | RequestItem["status"])}
                >
                  <option value="all">Any Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div style={{ display: "grid", gap: "0.5rem" }}>
                <label style={{ fontWeight: 600, color: "#334155", fontSize: "0.85rem" }}>Form Submission</label>
                <select
                  className="input"
                  style={{ borderRadius: "8px" }}
                  value={formStatusFilter}
                  onChange={(e) => setFormStatusFilter(e.target.value as "all" | "submitted" | "pending")}
                >
                  <option value="all">Any State</option>
                  <option value="submitted">Form Submitted</option>
                  <option value="pending">Waiting on Candidate</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearFilters}
                style={{ width: "100%", maxWidth: "170px", padding: "0.5rem 1rem", fontSize: "0.85rem", color: "#64748B", background: "white", border: "1px solid #E2E8F0" }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}

        <p style={{ margin: "1rem 0 0", color: "#64748B", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          Showing <strong>{filteredRequests.length}</strong> matching request{filteredRequests.length === 1 ? "" : "s"} across <strong>{groupedRequests.length}</strong> compan{groupedRequests.length === 1 ? "y" : "ies"}.
        </p>
      </section>

      {groupedRequests.length === 0 ? (
        <section className="glass-card" style={{ padding: "1rem" }}>
          <p style={{ margin: 0, color: "#667892" }}>
            No requests found for the current search and filters.
          </p>
        </section>
      ) : (
        groupedRequests.map((group, index) => renderCompanyGroup(group, index))
      )}

      {activeResponseRequest ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Candidate responses"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(16, 24, 40, 0.45)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            className="glass-card"
            style={{
              width: "70vw",
              maxWidth: "calc(100vw - 2rem)",
              maxHeight: "86vh",
              overflowY: "auto",
              padding: "1rem",
              background: "#FFFFFF",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
              <div>
                <h3 style={{ margin: 0 }}>Request Status Workspace</h3>
                <p style={{ margin: "0.25rem 0 0", color: "#667892" }}>
                  {activeResponseRequest.candidateName} • {activeResponseRequest.customerName}
                </p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveResponseRequestId("")}>
                <X size={16} />
              </button>
            </div>

            {renderServiceVerificationWorkspace(activeResponseRequest)}

            {renderResponseContent(activeResponseRequest)}
          </div>
        </div>
      ) : null}

      {activeReportPreviewRequest ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Verification report preview"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.56)",
            zIndex: 1300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            className="glass-card"
            style={{
              width: "min(1200px, calc(100vw - 2rem))",
              maxHeight: "88vh",
              overflowY: "auto",
              padding: "1rem",
              background: "#FFFFFF",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "0.95rem", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0, color: "#1E293B" }}>Generated Report Preview</h3>
                <p style={{ margin: "0.35rem 0 0", color: "#64748B" }}>
                  {activeReportPreviewRequest.candidateName} • {activeReportPreviewRequest.customerName}
                </p>
              </div>

              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {canGenerateReport ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={reportingRequestId === activeReportPreviewRequest._id}
                    onClick={() => generateReport(activeReportPreviewRequest._id)}
                    style={{ padding: "0.42rem 0.75rem", fontSize: "0.84rem" }}
                  >
                    {reportingRequestId === activeReportPreviewRequest._id
                      ? "Generating..."
                      : "Generate + Download PDF"}
                  </button>
                ) : null}

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveReportPreviewRequestId("")}
                  style={{ padding: "0.42rem 0.72rem" }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {renderReportPreview(activeReportPreviewRequest)}
          </div>
        </div>
      ) : null}
    </AdminPortalFrame>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={<main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>}>
      <RequestsPageContent />
    </Suspense>
  );
}
