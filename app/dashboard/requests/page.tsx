"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  ListFilter,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { getAlertTone } from "@/lib/alerts";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import { RequestItem } from "@/lib/types";

type SectionType = "pending" | "approved" | "rejected" | "archived";

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

export default function RequestsPage() {
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
  const [searchText, setSearchText] = useState("");
  const [archivedSearchText, setArchivedSearchText] = useState("");
  const [message, setMessage] = useState("");
  const [highlightedRequestId, setHighlightedRequestId] = useState("");
  const [activeResponseRequestId, setActiveResponseRequestId] = useState("");
  const [collapsedRequestSections, setCollapsedRequestSections] = useState<Record<SectionType, boolean>>({
    pending: false,
    approved: false,
    rejected: false,
    archived: false,
  });
  const [archiveCutoffMs] = useState(() => Date.now() - 14 * 24 * 60 * 60 * 1000);

  const focusRequestId = searchParams.get("requestId")?.trim() ?? "";

  const loadRequests = useCallback(async (force = true) => {
    await queryClient.fetchQuery({
      queryKey: REQUESTS_QUERY_KEY,
      queryFn: fetchRequests,
      staleTime: force ? 0 : REQUESTS_STALE_TIME_MS,
    });
  }, [queryClient]);

  async function updateStatus(requestId: string, status: "approved" | "rejected", rejectionNote?: string) {
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

  function toggleRequestSection(statusType: SectionType) {
    setCollapsedRequestSections((prev) => ({
      ...prev,
      [statusType]: !prev[statusType],
    }));
  }

  const normalizedSearch = searchText.trim().toLowerCase();
  const normalizedArchivedSearch = archivedSearchText.trim().toLowerCase();

  const filteredRequests = useMemo(
    () =>
      requests.filter((item) => {
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
          (item.selectedServices ?? []).map((service) => service.serviceName).join(" "),
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(normalizedSearch);
      }),
    [normalizedSearch, requests],
  );

  function isArchivedRequest(item: RequestItem) {
    const createdAtMs = new Date(item.createdAt).getTime();
    if (Number.isNaN(createdAtMs)) {
      return false;
    }

    return createdAtMs <= archiveCutoffMs;
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
      (item.selectedServices ?? []).map((service) => service.serviceName).join(" "),
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedArchivedSearch);
  });

  const pendingRequests = activeRequests.filter((item) => item.status === "pending");
  const approvedRequests = activeRequests.filter((item) => item.status === "approved");
  const rejectedRequests = activeRequests.filter((item) => item.status === "rejected");

  useEffect(() => {
    if (!focusRequestId || requests.length === 0) {
      return;
    }

    const targetRequest = requests.find((item) => item._id === focusRequestId);
    if (!targetRequest) {
      return;
    }

    const targetCreatedAtMs = new Date(targetRequest.createdAt).getTime();
    const shouldOpenArchived = !Number.isNaN(targetCreatedAtMs) && targetCreatedAtMs <= archiveCutoffMs;

    const stateUpdateTimer = window.setTimeout(() => {
      setSearchText("");
      setArchivedSearchText("");
      setCollapsedRequestSections((prev) => ({
        ...prev,
        archived: shouldOpenArchived ? false : prev.archived,
        pending: !shouldOpenArchived && targetRequest.status === "pending" ? false : prev.pending,
        approved: !shouldOpenArchived && targetRequest.status === "approved" ? false : prev.approved,
        rejected: !shouldOpenArchived && targetRequest.status === "rejected" ? false : prev.rejected,
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
  }, [archiveCutoffMs, focusRequestId, requests]);

  const activeResponseRequest = useMemo(
    () => requests.find((item) => item._id === activeResponseRequestId) ?? null,
    [activeResponseRequestId, requests],
  );

  function renderResponseContent(item: RequestItem) {
    if (!item.candidateFormResponses || item.candidateFormResponses.length === 0) {
      return <p style={{ margin: 0, color: "#667892" }}>Candidate has not submitted form responses yet.</p>;
    }

    return (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {item.candidateFormResponses.map((serviceResponse) => (
          <div
            key={`${item._id}-${serviceResponse.serviceId}`}
            style={{
              border: "1px solid #DDE5EF",
              borderRadius: "10px",
              padding: "0.7rem 0.75rem",
              background: "#F8FAFD",
            }}
          >
            <strong style={{ color: "#2D405E" }}>{serviceResponse.serviceName}</strong>
            <div style={{ marginTop: "0.45rem", display: "grid", gap: "0.35rem" }}>
              {serviceResponse.answers.length === 0 ? (
                <span style={{ color: "#667892" }}>No answers available.</span>
              ) : (
                serviceResponse.answers.map((answer, answerIndex) => (
                  <div key={`${serviceResponse.serviceId}-${answerIndex}`}>
                    <span style={{ fontWeight: 600 }}>{answer.question}:</span>{" "}
                    {answer.fieldType === "file" && answer.fileData ? (
                      <span style={{ display: "inline-flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, color: "#4A90E2" }}>
                          {answer.fileName || "attachment"}
                        </span>
                        <a
                          href={answer.fileData}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#4A90E2", textDecoration: "underline" }}
                        >
                          Open
                        </a>
                        <a
                          href={answer.fileData}
                          download={answer.fileName || `attachment-${answerIndex}`}
                          style={{ color: "#4A90E2", textDecoration: "underline" }}
                        >
                          Download
                        </a>
                      </span>
                    ) : (
                      answer.value || "-"
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderRequestSection(
    title: string,
    items: RequestItem[],
    emptyMessage: string,
    statusType: SectionType,
  ) {
    const isCollapsed = collapsedRequestSections[statusType];
    const StatusIcon =
      statusType === "pending"
        ? Clock
        : statusType === "approved"
          ? CheckCircle
          : statusType === "rejected"
            ? XCircle
            : Archive;
    const iconColor =
      statusType === "pending"
        ? "#4A90E2"
        : statusType === "approved"
          ? "#5CB85C"
          : statusType === "rejected"
            ? "#C0392B"
            : "#2D405E";

    return (
      <section className="glass-card" style={{ padding: "1rem", marginTop: "1rem" }}>
        <button
          type="button"
          onClick={() => toggleRequestSection(statusType)}
          className="request-panel-header"
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${title}`}
        >
          <h3 style={{ marginTop: 0, marginBottom: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <StatusIcon size={20} color={iconColor} />
            {title} ({items.length})
          </h3>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </span>
        </button>

        {statusType === "archived" && !isCollapsed ? (
          <div className="search-input-wrap" style={{ marginBottom: "0.8rem" }}>
            <span className="search-input-icon" aria-hidden="true" style={{ marginTop: "0.1rem" }}>
              <Search size={18} />
            </span>
            <input
              className="input"
              placeholder="Search archived requests by company, candidate, email, phone, status or note"
              value={archivedSearchText}
              onChange={(e) => setArchivedSearchText(e.target.value)}
            />
          </div>
        ) : null}

        {!isCollapsed && items.length === 0 ? <p style={{ margin: 0 }}>{emptyMessage}</p> : null}

        {!isCollapsed && items.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: "1280px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #DDE5EF", textAlign: "left" }}>
                  <th style={{ padding: "0.7rem 0.55rem" }}>Candidate</th>
                  <th style={{ padding: "0.7rem 0.55rem" }}>Company</th>
                  <th style={{ padding: "0.7rem 0.55rem" }}>Contact</th>
                  <th style={{ padding: "0.7rem 0.55rem" }}>Services</th>
                  <th style={{ padding: "0.7rem 0.55rem" }}>Form</th>
                  <th style={{ padding: "0.7rem 0.55rem" }}>Status</th>
                  <th style={{ padding: "0.7rem 0.55rem" }}>Admin Note</th>
                  <th style={{ padding: "0.7rem 0.55rem" }}>Created</th>
                  <th style={{ padding: "0.7rem 0.55rem" }}>Responses</th>
                  <th style={{ padding: "0.7rem 0.55rem" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const hasResponses = Boolean(item.candidateFormResponses && item.candidateFormResponses.length > 0);
                  const formSubmitted = item.candidateFormStatus === "submitted";
                  let canApprove = item.status === "pending" || item.status === "rejected";
                  let canReject = item.status === "pending" || (item.status === "approved" && me?.role === "superadmin");

                  if (statusType === "archived") {
                    canApprove = item.status === "rejected";
                    canReject = false;
                  }

                  return (
                    <tr
                      key={`${statusType}-${item._id}`}
                      id={`request-${item._id}`}
                      style={{
                        borderBottom: "1px solid #ECF0F5",
                        background: highlightedRequestId === item._id ? "#EEF6FF" : "transparent",
                      }}
                    >
                      <td style={{ padding: "0.75rem 0.55rem", fontWeight: 600, color: "#2D405E" }}>{item.candidateName}</td>
                      <td style={{ padding: "0.75rem 0.55rem" }}>
                        <div style={{ fontWeight: 600 }}>{item.customerName || "-"}</div>
                        <div style={{ fontSize: "0.78rem", color: "#667892" }}>{item.customerEmail || "-"}</div>
                      </td>
                      <td style={{ padding: "0.75rem 0.55rem" }}>
                        <div>{item.candidateEmail || "-"}</div>
                        <div style={{ fontSize: "0.78rem", color: "#667892" }}>{item.candidatePhone || "-"}</div>
                      </td>
                      <td style={{ padding: "0.75rem 0.55rem", maxWidth: "230px" }}>
                        <span style={{ display: "inline-block", lineHeight: 1.4 }}>
                          {item.selectedServices && item.selectedServices.length > 0
                            ? item.selectedServices.map((service) => service.serviceName).join(", ")
                            : "-"}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 0.55rem" }}>
                        <div style={{ fontWeight: 600, color: formSubmitted ? "#2f6f3e" : "#8A6D3B" }}>
                          {formSubmitted ? "Submitted" : "Pending"}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "#667892" }}>
                          {item.candidateSubmittedAt ? new Date(item.candidateSubmittedAt).toLocaleString() : "-"}
                        </div>
                      </td>
                      <td style={{ padding: "0.75rem 0.55rem" }}>
                        <span className={`status-pill status-pill-${item.status}`} style={{ textTransform: "capitalize" }}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 0.55rem", maxWidth: "220px" }}>{item.rejectionNote || "-"}</td>
                      <td style={{ padding: "0.75rem 0.55rem", whiteSpace: "nowrap" }}>
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "0.75rem 0.55rem" }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setActiveResponseRequestId(item._id)}
                          disabled={!hasResponses}
                        >
                          {hasResponses ? "View" : "No data"}
                        </button>
                      </td>
                      <td style={{ padding: "0.75rem 0.55rem" }}>
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          {canApprove ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-outline-success"
                              onClick={() => approveRequest(item._id)}
                              disabled={!formSubmitted}
                              title={formSubmitted ? "Approve request" : "Candidate form is not submitted yet"}
                            >
                              Approve
                            </button>
                          ) : null}
                          {canReject ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-outline-danger"
                              onClick={() => rejectWithNote(item._id)}
                              disabled={!formSubmitted}
                              title={formSubmitted ? "Reject request" : "Candidate form is not submitted yet"}
                            >
                              Reject
                            </button>
                          ) : null}
                          {!canApprove && !canReject ? <span style={{ color: "#95A2B5" }}>-</span> : null}
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
      subtitle="Table-focused request management with faster scanning and actions."
    >
      {message ? <p className={`inline-alert ${getAlertTone(message)}`}>{message}</p> : null}

      <section className="glass-card" style={{ padding: "1.1rem", marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ListFilter size={24} color="#4A90E2" />
          Verification Requests
        </h2>
        <p style={{ color: "#6C757D", marginTop: 0 }}>
          Tabular request view designed for wider layouts and quicker review.
        </p>
        <div className="search-input-wrap">
          <span className="search-input-icon" aria-hidden="true" style={{ marginTop: "0.1rem" }}>
            <Search size={18} />
          </span>
          <input
            className="input"
            placeholder="Search by company, candidate, email, phone, service, status or note"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </section>

      {renderRequestSection("Pending Requests", pendingRequests, "No pending requests found.", "pending")}
      {renderRequestSection("Approved Requests", approvedRequests, "No approved requests found.", "approved")}
      {renderRequestSection("Rejected Requests", rejectedRequests, "No rejected requests found.", "rejected")}
      {renderRequestSection("Archived Requests", archivedRequests, "No archived requests found.", "archived")}

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
