"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  ListFilter,
  Search,
  XCircle,
} from "lucide-react";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { getAlertTone } from "@/lib/alerts";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import { RequestItem } from "@/lib/types";

type SectionType = "pending" | "approved" | "rejected" | "archived";

export default function RequestsPage() {
  const { me, loading, logout } = useAdminSession();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [archivedSearchText, setArchivedSearchText] = useState("");
  const [message, setMessage] = useState("");
  const [expandedRequestIds, setExpandedRequestIds] = useState<Record<string, boolean>>({});
  const [collapsedRequestSections, setCollapsedRequestSections] = useState<Record<SectionType, boolean>>({
    pending: false,
    approved: false,
    rejected: false,
    archived: false,
  });
  const [archiveCutoffMs, setArchiveCutoffMs] = useState(0);
  const [loadingRequests, setLoadingRequests] = useState(true);

  async function loadRequests() {
    setLoadingRequests(true);
    const reqRes = await fetch("/api/requests", { cache: "no-store" });
    if (reqRes.ok) {
      const reqJson = (await reqRes.json()) as { items: RequestItem[] };
      setRequests(reqJson.items);
    }
    setArchiveCutoffMs(Date.now() - 14 * 24 * 60 * 60 * 1000);
    setLoadingRequests(false);
  }

  useEffect(() => {
    if (!me) {
      return;
    }

    let active = true;
    (async () => {
      await loadRequests();
      if (!active) {
        return;
      }
    })();

    return () => {
      active = false;
    };
  }, [me]);

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

  function toggleRequestExpand(requestId: string) {
    setExpandedRequestIds((prev) => ({
      ...prev,
      [requestId]: !prev[requestId],
    }));
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
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedArchivedSearch);
  });

  const pendingRequests = activeRequests.filter((item) => item.status === "pending");
  const approvedRequests = activeRequests.filter((item) => item.status === "approved");
  const rejectedRequests = activeRequests.filter((item) => item.status === "rejected");

  function renderRequestSection(
    title: string,
    items: RequestItem[],
    emptyMessage: string,
    statusType: "pending" | "approved" | "rejected",
  ) {
    const isCollapsed = collapsedRequestSections[statusType];

    const StatusIcon =
      statusType === "pending" ? Clock : statusType === "approved" ? CheckCircle : XCircle;

    const iconColor = statusType === "pending" ? "#eab308" : statusType === "approved" ? "#22c55e" : "#ef4444";

    return (
      <section className="glass-card" style={{ padding: "1.2rem", marginTop: "1.2rem" }}>
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

        {!isCollapsed && items.length === 0 && <p style={{ margin: 0 }}>{emptyMessage}</p>}

        {!isCollapsed && items.length > 0 && (
          <div className="request-accordion-list">
            {items.map((item) => {
              const expanded = Boolean(expandedRequestIds[item._id]);
              return (
                <article key={item._id} className="request-accordion-item">
                  <button type="button" className="request-accordion-toggle" onClick={() => toggleRequestExpand(item._id)}>
                    <div className="request-accordion-main">
                      <div className="request-accordion-candidate">{item.candidateName}</div>
                      <div className="request-accordion-status" style={{ textTransform: "capitalize", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <StatusIcon size={16} color={iconColor} />
                        {item.status}
                      </div>
                    </div>
                    <span className="request-accordion-arrow">{expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</span>
                  </button>

                  {expanded && (
                    <div className="request-accordion-details">
                      <div className="request-card-label">Company</div>
                      <div className="request-card-value">{item.customerName}</div>

                      <div className="request-card-label">Company Email</div>
                      <div className="request-card-value">{item.customerEmail}</div>

                      <div className="request-card-label">Candidate Email</div>
                      <div className="request-card-value">{item.candidateEmail}</div>

                      <div className="request-card-label">Submitted By</div>
                      <div className="request-card-value">{item.createdByName || "Unknown"}</div>

                      <div className="request-card-label">Phone</div>
                      <div className="request-card-value">{item.candidatePhone || "-"}</div>

                      <div className="request-card-label">Admin Note</div>
                      <div className="request-card-value">{item.rejectionNote || "-"}</div>

                      <div className="request-card-label">Created</div>
                      <div className="request-card-value">{new Date(item.createdAt).toLocaleString()}</div>

                      {(statusType === "pending" || statusType === "rejected" || (statusType === "approved" && me?.role === "superadmin")) && (
                        <div className="request-card-actions" style={{ marginTop: "0.35rem" }}>
                          {(statusType === "pending" || statusType === "rejected") && (
                            <button type="button" className="btn btn-secondary btn-outline-success" onClick={() => approveRequest(item._id)}>
                              <CheckCircle size={16} style={{ marginRight: "0.4rem" }} />
                              Approve
                            </button>
                          )}
                          {(statusType === "pending" || (statusType === "approved" && me?.role === "superadmin")) && (
                            <button type="button" className="btn btn-secondary btn-outline-danger" onClick={() => rejectWithNote(item._id)}>
                              <XCircle size={16} style={{ marginRight: "0.4rem" }} />
                              Reject
                            </button>
                          )}
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
          className="request-panel-header"
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

        {!isCollapsed && (
          <p style={{ color: "#5a748f", marginTop: 0 }}>
            Requests older than 14 days are automatically moved here.
          </p>
        )}

        {!isCollapsed && (
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
        )}

        {!isCollapsed && items.length === 0 && <p style={{ margin: 0 }}>No archived requests found.</p>}

        {!isCollapsed && items.length > 0 && (
          <div className="request-accordion-list">
            {items.map((item) => {
              const expanded = Boolean(expandedRequestIds[item._id]);
              return (
                <article key={`archived-${item._id}`} className="request-accordion-item">
                  <button type="button" className="request-accordion-toggle" onClick={() => toggleRequestExpand(item._id)}>
                    <div className="request-accordion-main">
                      <div className="request-accordion-candidate">{item.candidateName}</div>
                      <div className={`status-pill status-pill-${item.status}`} style={{ textTransform: "capitalize" }}>
                        {item.status}
                      </div>
                    </div>
                    <span className="request-accordion-arrow">{expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</span>
                  </button>

                  {expanded && (
                    <div className="request-accordion-details">
                      <div className="request-card-label">Company</div>
                      <div className="request-card-value">{item.customerName}</div>

                      <div className="request-card-label">Company Email</div>
                      <div className="request-card-value">{item.customerEmail}</div>

                      <div className="request-card-label">Candidate Email</div>
                      <div className="request-card-value">{item.candidateEmail}</div>

                      <div className="request-card-label">Submitted By</div>
                      <div className="request-card-value">{item.createdByName || "Unknown"}</div>

                      <div className="request-card-label">Phone</div>
                      <div className="request-card-value">{item.candidatePhone || "-"}</div>

                      <div className="request-card-label">Admin Note</div>
                      <div className="request-card-value">{item.rejectionNote || "-"}</div>

                      <div className="request-card-label">Created</div>
                      <div className="request-card-value">{new Date(item.createdAt).toLocaleString()}</div>

                      {item.status === "rejected" && (
                        <div className="request-card-actions" style={{ marginTop: "0.35rem" }}>
                          <button type="button" className="btn btn-secondary btn-outline-success" onClick={() => approveRequest(item._id)}>
                            <CheckCircle size={16} style={{ marginRight: "0.4rem" }} />
                            Approve
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

  if (loading || !me || loadingRequests) {
    return <main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>;
  }

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Verification Requests"
      subtitle="Focused queue for approvals, rejections, and archived review."
    >
      {message ? <p className={`inline-alert ${getAlertTone(message)}`}>{message}</p> : null}

      <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ListFilter size={24} color="#4A90E2" />
          Verification Requests
        </h2>
        <p style={{ color: "#5a748f", marginTop: 0 }}>
          Search and manage requests across Pending, Approved, and Rejected sections.
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

      {renderRequestSection("Pending Requests", pendingRequests, "No pending requests found.", "pending")}
      {renderRequestSection("Approved Requests", approvedRequests, "No approved requests found.", "approved")}
      {renderRequestSection("Rejected Requests", rejectedRequests, "No rejected requests found.", "rejected")}
      {renderArchivedSection(archivedRequests)}
    </AdminPortalFrame>
  );
}
