"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ListFilter,
  Search,
  SlidersHorizontal,
  X,
  XCircle,
} from "lucide-react";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { getAlertTone } from "@/lib/alerts";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import { RequestItem } from "@/lib/types";

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
  const canManageStatuses =
    me?.role === "admin" ||
    me?.role === "superadmin" ||
    me?.role === "manager" ||
    me?.role === "verifier";
  const [searchText, setSearchText] = useState("");
  const [message, setMessage] = useState("");
  const [highlightedRequestId, setHighlightedRequestId] = useState("");
  const [activeResponseRequestId, setActiveResponseRequestId] = useState("");
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

  async function updateStatus(
    requestId: string,
    status: "approved" | "rejected" | "verified",
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
    await loadRequests();
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

  async function verifyRequest(requestId: string) {
    const isConfirmed = window.confirm("Confirm mark this request as verified?");
    if (!isConfirmed) {
      return;
    }

    await updateStatus(requestId, "verified");
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
                  <th style={{ padding: "1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0" }}>Data</th>
                  <th style={{ padding: "1rem", color: "#475569", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #E2E8F0", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item, index) => {
                  const hasResponses = Boolean(item.candidateFormResponses && item.candidateFormResponses.length > 0);
                  const formSubmitted = item.candidateFormStatus === "submitted";
                  const canApprove = canManageStatuses && (item.status === "pending" || item.status === "rejected");
                  const canReject =
                    canManageStatuses &&
                    (item.status === "pending" || (item.status === "approved" && me?.role === "superadmin"));
                  const canVerify = canManageStatuses && item.status === "approved";
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
                          onClick={() => setActiveResponseRequestId(item._id)}
                          disabled={!hasResponses}
                          style={{
                            background: hasResponses ? "#EFF6FF" : "#F1F5F9",
                            color: hasResponses ? "#2563EB" : "#94A3B8",
                            border: "none",
                            padding: "0.4rem 0.8rem",
                            borderRadius: "6px",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            cursor: hasResponses ? "pointer" : "not-allowed",
                            transition: "background 0.2s"
                          }}
                        >
                          {hasResponses ? "View Data" : "Empty"}
                        </button>
                      </td>
                      <td style={{ padding: "1rem", borderBottom: "1px solid #F1F5F9", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {canApprove ? (
                            <button
                              type="button"
                              onClick={() => approveRequest(item._id)}
                              disabled={!formSubmitted}
                              title={formSubmitted ? "Approve" : "Form not submitted"}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 500, fontSize: "0.85rem",
                                background: formSubmitted ? "#F0FDF4" : "transparent", border: formSubmitted ? "1px solid #BBF7D0" : "1px solid transparent", borderRadius: "6px", cursor: formSubmitted ? "pointer" : "not-allowed",
                                color: formSubmitted ? "#16A34A" : "#CBD5E1", padding: "0.3rem 0.6rem", transition: "all 0.2s"
                              }}
                            >
                              <CheckCircle size={16} /> Approve
                            </button>
                          ) : null}
                          {canReject ? (
                            <button
                              type="button"
                              onClick={() => rejectWithNote(item._id)}
                              disabled={!formSubmitted}
                              title={formSubmitted ? "Reject" : "Form not submitted"}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 500, fontSize: "0.85rem",
                                background: formSubmitted ? "#FEF2F2" : "transparent", border: formSubmitted ? "1px solid #FECACA" : "1px solid transparent", borderRadius: "6px", cursor: formSubmitted ? "pointer" : "not-allowed",
                                color: formSubmitted ? "#DC2626" : "#CBD5E1", padding: "0.3rem 0.6rem", transition: "all 0.2s"
                              }}
                            >
                              <XCircle size={16} /> Reject
                            </button>
                          ) : null}
                          {canVerify ? (
                            <button
                              type="button"
                              onClick={() => verifyRequest(item._id)}
                              disabled={!formSubmitted}
                              title={formSubmitted ? "Verify" : "Form not submitted"}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 500, fontSize: "0.85rem",
                                background: formSubmitted ? "#EFF6FF" : "transparent", border: formSubmitted ? "1px solid #BFDBFE" : "1px solid transparent", borderRadius: "6px", cursor: formSubmitted ? "pointer" : "not-allowed",
                                color: formSubmitted ? "#2563EB" : "#CBD5E1", padding: "0.3rem 0.6rem", transition: "all 0.2s"
                              }}
                            >
                              <BadgeCheck size={16} /> Verify
                            </button>
                          ) : null}
                          {!canApprove && !canReject && !canVerify ? <span style={{ color: "#CBD5E1" }}>-</span> : null}
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
              Unified dashboard for processing candidates, approvals, and validations
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
              width: "min(920px, calc(100vw - 2rem))",
              maxHeight: "86vh",
              overflowY: "auto",
              padding: "1rem",
              background: "#FFFFFF",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
              <div>
                <h3 style={{ margin: 0 }}>Candidate Responses</h3>
                <p style={{ margin: "0.25rem 0 0", color: "#667892" }}>
                  {activeResponseRequest.candidateName} • {activeResponseRequest.customerName}
                </p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveResponseRequestId("")}>
                <X size={16} />
              </button>
            </div>

            {renderResponseContent(activeResponseRequest)}
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
